// import core from '@actions/core'
// import github from '@actions/github'
import { Octokit } from '@octokit/rest'
import nj from 'nunjucks'
import path from 'path'
import pc from 'picocolors'
import { fileURLToPath } from 'url'

// #region Types
/** The name of the team that will own the repository. */
export type RepoTeamName = 'Platform' | 'Frontend' | 'Backend' | 'DevOps' | 'QA' | 'Design'

/** The "templates" available to create a repo from. */
export type RepoType = 'Bun' | 'Elysia'

/** An object containing the team that'll own the repository. */
export type RepoTeam = {
  name: RepoTeamName
  description: string
}

/** An object containing all the teams that can own a repository. */
export type RepoTeams = {
  [key in RepoTeamName]: RepoTeam
}

/** The input for creating the repo provided by the user via GitHub Actions inputs. */
export type UserInput = {
  repoName: string
  repoTeam: RepoTeam
  repoType: RepoType
  repoOwner: string
  repoTopics?: string[]
  repoDescription?: string
  templateRepoName: string
}

/** An object containing the path to file that's been rendered and the path to the file. */
type RenderedTemplateFile = {
  path: string
  content: string
}

type GetContentsData = {
  /** @enum {string} */
  type: 'dir' | 'file' | 'submodule' | 'symlink'
  size: number
  name: string
  path: string
  content?: string
  sha: string
  /** Format: uri */
  url: string
  /** Format: uri */
  git_url: string | null
  /** Format: uri */
  html_url: string | null
  /** Format: uri */
  download_url: string | null
  submodule_git_url?: string
  _links: {
    /** Format: uri */
    git: string | null
    /** Format: uri */
    html: string | null
    /** Format: uri */
    self: string
  }
}
// #endregion Types

// #region Constants
// Maps to the GITHUB_TOKEN or GH_PAT secret, if it exists.
export const ApiToken = process.env.GITHUB_TOKEN || process.env.GH_PAT

// Throw an error if the GitHub Access Token is not found in the environment.
if (!ApiToken) {
  throw new Error(
    'GitHub Access Token not found in environment, must be set as GITHUB_TOKEN or GH_PAT.',
  )
}

// Create a new GitHub client using the api token provided.
export const gh = new Octokit({ auth: ApiToken })

/** A map of the teams that can own a repository. */
export const RepoTeams: { [key in RepoTeamName]: RepoTeam } = {
  Backend: {
    name: 'Backend',
    description: 'The team responsible for backend services.',
  },
  Design: {
    name: 'Design',
    description: 'The team responsible for design.',
  },
  DevOps: {
    name: 'DevOps',
    description: 'The team responsible for DevOps.',
  },
  Frontend: {
    name: 'Frontend',
    description: 'The team responsible for frontend services.',
  },
  Platform: {
    name: 'Platform',
    description: 'The team responsible for the platform.',
  },
  QA: {
    name: 'QA',
    description: 'The team responsible for QA.',
  },
}

/** The directory name of the current file (in this case `$CWD/New-Repo-Task/src/index.ts`). */
export const __dirname = path.dirname(fileURLToPath(import.meta.url))

// #endregion Constants

// #region Functions
/**
 * Gets the user input from environment variables set by the GitHub Action workflow and its inputs.
 *
 * @returns The user input.
 */
function getInput(): UserInput {
  const templateRepoName = process.env.TEMPLATE_REPO_NAME || 'Blog-GitHub-API-Automation-Template'

  const repoName = process.env.REPO_NAME
  if (!repoName) throw new Error('REPO_NAME is a required environment variable.')

  const repoTeamName = process.env.REPO_TEAM as RepoTeamName
  if (!repoTeamName) throw new Error('REPO_TEAM is a required environment variable.')

  const repoType = process.env.REPO_TYPE as RepoType
  if (!repoType) throw new Error('REPO_TYPE is a required environment variable.')

  const repoOwner =
    (process.env.GITHUB_REPOSITORY_OWNER as RepoType) || (process.env.REPO_OWNER as RepoType)
  if (!repoOwner) throw new Error('REPO_OWNER is a required environment variable.')

  const repoTopics = process.env.REPO_TOPICS?.split(',')
  const repoDescription = process.env.REPO_DESCRIPTION

  return {
    repoName,
    repoTeam: RepoTeams[repoTeamName],
    repoType,
    repoOwner,
    repoTopics,
    repoDescription,
    templateRepoName,
  }
}

/**
 * Converts a filename from a Nunjucks template to the filename it should be in the new repository.
 * Since there's only two files that could be a Nunjucks template, this is a simple function. If
 * more files are added that could be a Nunjucks template, this function should be updated.
 *
 * @param filename The original filename.
 *
 * @returns The new filename.
 */
function getNewFilename(filename: string) {
  if (filename === 'README.njk') return 'README.md'
  if (filename === 'package.njk') return 'package.json'

  return filename
}

/**
 * Attempts to render the provided Nunjucks template
 * @param file The file to render, as returned from the GitHub API.
 * @param input The user input to use when rendering the file.
 * @returns A rendered file, if the file has content, otherwise undefined.
 */
function renderFileData(file: GetContentsData, input: UserInput): RenderedTemplateFile | undefined {
  // Verify the file has content.
  if (file.content) {
    // Get the filename and directory for the file.
    const filename = path.basename(file.path)
    const fileDir = path.dirname(file.path)

    console.debug(`[renderFileData] Rendering file: ${filename}`)
    console.debug(`[renderFileData] File Directory: ${fileDir}`)

    // Check if the file is a Nunjucks template and render it if so.
    if (file.path.endsWith('.njk')) {
      // Get the new filename for the rendered file.
      const newFilename = getNewFilename(filename)

      // Decode the file content.
      const fileContent = Buffer.from(file.content.toString(), 'base64').toString()

      // Render the file content using the user input.
      const renderedContent = nj.renderString(fileContent, input)

      return {
        path: path.join(fileDir, newFilename),
        content: renderedContent,
      }
    } else {
      // If the file is not a Nunjucks template, return the file as-is.
      return {
        path: file.path,
        content: Buffer.from(file.content.toString(), 'base64').toString(),
      }
    }
  } else return undefined
}

/**
 * Gets all the files from the template specified in the user input provided by the`input`
 * parameter, renders them using the user input, and returns them as an array of rendered files.
 *
 * @param input The user input to use when rendering the file.
 *
 * @returns An array of files to populate the new repository with.
 */
async function getTemplateFiles(input: UserInput): Promise<RenderedTemplateFile[]> {
  const renderedTemplateFiles: RenderedTemplateFile[] = []

  try {
    // Get the git tree to gather all the files in the template repo.
    const { status, data } = await gh.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      repo: input.templateRepoName,
      owner: input.repoOwner,
      recursive: 'true',
      tree_sha: 'main',
    })

    // Make sure the request was successful, otherwise throw an error.
    if (status !== 200) throw new Error('Template file tree(s) not found')

    // Log some response details from the GitHub API.
    console.debug(`[getTemplateFiles] Template Files Tree Status: ${status}`)

    for (const treeNode of data.tree) {
      // Check that the data is for a blob, has a path, and is in the directory for the repo type.
      if (
        treeNode.type === 'blob' &&
        treeNode.path &&
        treeNode.path.startsWith(`${input.repoType.toLowerCase()}/`)
      ) {
        const fileContent = await gh.rest.repos.getContent({
          repo: input.templateRepoName,
          owner: input.repoOwner,
          path: treeNode.path,
        })

        // Log the response status from the GitHub API.
        console.debug(`[getTemplateFiles] Template File Content Status: ${fileContent.status}`)

        // Verify the response status was a 200.
        if (fileContent.status !== 200) throw new Error(`Template file not found: ${treeNode.path}`)

        // Attempt to render the file, if it has content that is a Nunjucks template.
        const renderedTemplateFile = renderFileData(fileContent.data as GetContentsData, input)

        // If the file was rendered successfully, add it to the list of rendered files to return.
        if (renderedTemplateFile) renderedTemplateFiles.push(renderedTemplateFile)
      }
    }

    return renderedTemplateFiles
  } catch (error) {
    console.error(`[ERROR][getTemplateFiles] Error caught when getting template files:`)
    console.error(error)

    return []
  }
}
// #endregion Functions

try {
  // Get the user input from the action's inputs.
  const userInput = getInput()

  const debugLogMsgs = [
    `[main] Creating a new repository with the following details:\n`,
    `\t- Name: ${userInput.repoName}`,
    `\t- Team: ${userInput.repoTeam.name}`,
    `\t- Type: ${userInput.repoType}`,
    `\t- Owner: ${userInput.repoOwner}`,
    `\t- Topics: ${userInput.repoTopics?.join(', ')}`,
    `\t- Description: ${userInput.repoDescription}`,
  ]

  console.debug(debugLogMsgs.join('\n'))

  // Create the new repository using the GitHub API.
  const createRepoRes = await gh.rest.repos.createInOrg({
    // Required
    name: userInput.repoName,
    org: userInput.repoOwner,

    // Optional
    description: userInput.repoDescription,
    private: true,
    has_wiki: false,
    has_issues: true,
    has_projects: true,
    has_downloads: true,
    has_discussions: false,
  })

  // Log the response status from the GitHub API.
  console.log(`[main] Repo Create Status: ${createRepoRes.status}`)

  console.log(`[main] UserInput Repo Topics:`)
  console.log(userInput.repoTopics)

  console.log(`[main] UserInput Description`)
  console.log(userInput.repoDescription)

  // Check if the user provided topics.
  if (userInput.repoTopics && userInput.repoTopics[0] !== '') {
    // If they did, replace the topics on the new repository using the GitHub API.
    const topicsRes = await gh.rest.repos.replaceAllTopics({
      names: userInput.repoTopics || [],
      repo: userInput.repoName,
      owner: userInput.repoOwner,
    })

    // Log the response status from the GitHub API.
    console.log(`[main] Topics Response Status: ${topicsRes.status}`)
  }

  const templateFiles = await getTemplateFiles(userInput)
  const successfulAdditions = []

  // Add the rendered template files to the new repository using the GitHub API.
  for (const file of templateFiles) {
    console.log(`[main] Adding file: ${file.path}`)

    const createFileRes = await gh.rest.repos.createOrUpdateFileContents({
      message: `feat: added ${file.path} from template repo`,
      content: Buffer.from(file.content).toString('base64'),
      path: file.path,
      repo: userInput.repoName,
      owner: userInput.repoOwner,
    })

    // Log the response status from the GitHub API.
    console.log(pc.cyan(`[main] CreateOrUpdateFile Status: ${createFileRes.status}`))

    if (createFileRes.status === 201) successfulAdditions.push(file.path)
  }

  // Log the successful additions length and the template files length.
  console.log(`[main] Successful Additions Length: ${successfulAdditions.length}`)
  console.log(`[main] Template Files Length: ${templateFiles.length}`)
} catch (error) {
  console.error(pc.red('[ERROR][main] Error caught when creating and initializing repo'))
  console.error(error)
}
