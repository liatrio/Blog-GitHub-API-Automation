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
 * Creates a new README file for a repository using the provided `userInput`, `owner`, and
 * `repoType` parameters, along with Nunjucks, to render and return the README file.
 *
 * @param input The input required to create the README file.
 *
 * @returns The rendered README file as a string.
 */
async function createReadMe(input: UserInput): Promise<string> {
  const readMeTemplatePath = `${input.repoType.toLowerCase()}/README.njk`

  // Log some debug information.
  console.log(pc.gray(`[DEBUG][index#createReadMe] README Template Path: ${readMeTemplatePath}`))
  console.log(
    pc.gray(`[DEBUG][index#createReadMe] README User Input: ${JSON.stringify(input, null, 2)}`),
  )

  // Get the README file for the /New-Repo-Job directory.
  const readMeTemplate = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: readMeTemplatePath,
    owner: input.repoOwner,
  })

  if (readMeTemplate.status !== 200) throw new Error('README template not found')

  // Log some response details from the GitHub API.
  console.log(
    pc.gray(`[DEBUG][index#createReadMe] README Template Status: ${readMeTemplate.status}`),
  )

  // Decode the README template file contents.
  const decodedReadMeTemplate = Buffer.from(
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.content.toString(),
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.encoding,
  ).toString()

  return nj.renderString(decodedReadMeTemplate, input)
}

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
    const filename = path.basename(file.path)
    const fileDir = path.dirname(file.path)

    console.log(pc.cyan(`[DEBUG][index#renderFileData] Rendering file: ${filename}`))
    console.log(pc.cyan(`[DEBUG][index#renderFileData] File Directory: ${fileDir}`))

    // Check if the file is a Nunjucks template and render it if so.
    if (file.path.endsWith('.njk')) {
      // Get the new filename for the rendered file.
      const newFilename = getNewFilename(filename)

      // Log some debug information.
      console.log(pc.cyan(`[DEBUG][index#renderFileData] New Filename: ${newFilename}`))

      return {
        path: path.join(fileDir, getNewFilename(filename)),
        content: nj.renderString(Buffer.from(file.content.toString(), 'base64').toString(), input),
      }
    } else {
      return {
        path: file.path,
        content: Buffer.from(file.content.toString(), 'base64').toString(),
      }
    }
  } else return undefined
}

async function getTemplateFiles(input: UserInput): Promise<RenderedTemplateFile[]> {
  const decodedTemplateFiles: RenderedTemplateFile[] = []

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
    console.log(pc.gray(`[DEBUG][index#getTemplateFiles] Template Files Tree Status: ${status}`))

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

        // Log some response details from the GitHub API.
        console.log(
          pc.gray(
            `[DEBUG][index#getTemplateFiles] Template File Content Status: ${fileContent.status}`,
          ),
        )
        console.log(fileContent.data)

        // Make sure there is actually content to use.
        for (const file of fileContent.data as GetContentsData[]) {
          const renderedFile = renderFileData(file, input)
          if (renderedFile) decodedTemplateFiles.push(renderedFile)
        }
      }
    }

    return decodedTemplateFiles
  } catch (error) {
    console.error(`[ERROR][index#getTemplateFiles] Error caught when getting template files:`)
    console.error(error)

    return []
  }
}
// #endregion Functions

try {
  // Get the user input from the action's inputs.
  const userInput = getInput()

  const debugLogMsgs = [
    `[DEBUG][index#main] Creating a new repository with the following details:\n`,
    `- Name: ${userInput.repoName}`,
    `- Team: ${userInput.repoTeam.name}`,
    `- Type: ${userInput.repoType}`,
    `- Owner: ${userInput.repoOwner}`,
    `- Topics: ${userInput.repoTopics?.join(', ')}`,
    `- Description: ${userInput.repoDescription}`,
  ]

  console.log(pc.cyan(debugLogMsgs.join('\n')))

  const templateFiles = await getTemplateFiles(userInput)

  // Get the built README file content.
  // const builtReadMe = await createReadMe(userInput)

  // Log the built README file content.
  // console.log(pc.cyan(`[DEBUG] Built README:\n\n${builtReadMe}`))
  console.log(
    pc.cyan(
      `[DEBUG][index#main] We received the following ${templateFiles.length} files from the template repo`,
    ),
  )

  for (const file of templateFiles) {
    console.log(pc.cyan(`[DEBUG][index#main] File Path: ${file.path}`))
  }

  // Temporarily exit the process to prevent the repo from being created.
  process.exit(0)
  // Create the new repository using the GitHub API.
  // const createRepoRes = await gh.rest.repos.createForAuthenticatedUser({
  //   // Required
  //   name: userInput.repoName,
  //   description: userInput.repoDescription,

  //   // Optional
  //   private: true,
  //   has_wiki: false,
  //   has_issues: true,
  //   has_projects: true,
  //   has_downloads: true,
  //   has_discussions: false,
  // })
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

  // Log some response details from the GitHub API.
  console.log(pc.cyan(`[DEBUG][index#main] Repo Create Status: ${createRepoRes.status}`))
  console.log(
    pc.cyan(`[DEBUG][index#main] Repo Create Data: ${JSON.stringify(createRepoRes.data, null, 2)}`),
  )

  // Replace the topics on the new repository using the GitHub API.
  const topicsRes = await gh.rest.repos.replaceAllTopics({
    names: userInput.repoTopics || [],
    repo: userInput.repoName,
    owner: userInput.repoOwner,
  })

  // Log some response details from the GitHub API.
  console.log(pc.cyan(`[DEBUG][index#main] Topics Response Status: ${topicsRes.status}`))
  console.log(
    pc.cyan(`[DEBUG][index#main] Topics Response Data: ${JSON.stringify(topicsRes.data, null, 2)}`),
  )

  // Update the README file in the new repository using the GitHub API.
  // const updateReadMeRes = await gh.rest.repos.createOrUpdateFileContents({
  //   message: 'feat: updated README with values from GitHub Action',
  //   content: Buffer.from(builtReadMe).toString('base64'),
  //   path: 'README.md',
  //   repo: userInput.repoName,
  //   owner: userInput.repoOwner,
  // })

  // Log some response details from the GitHub API.
  // console.log(pc.cyan(`[DEBUG] Add README Response Status: ${updateReadMeRes.status}`))
  // console.log(
  //   pc.cyan(`[DEBUG] Add README Response Data: ${JSON.stringify(updateReadMeRes.data, null, 2)}`),
  // )

  console.log(pc.cyan(`[DEBUG][index#main] Attempting to get content w/ following opts:\n`))
  console.log(
    JSON.stringify(
      {
        repo: 'Blog-GitHub-API-Automation-Template',
        path: userInput.repoType.toLowerCase(),
        owner: userInput.repoOwner,
      },
      null,
      2,
    ),
  )

  const tmpFiles = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: userInput.repoType.toLowerCase(),
    owner: userInput.repoOwner,
  })

  console.log(pc.cyan(`[DEBUG][index#main] Template Files Response Status: ${tmpFiles.status}`))
  console.log(
    pc.cyan(
      `[DEBUG][index#main] Template Files Response Data: ${JSON.stringify(tmpFiles.data, null, 2)}`,
    ),
  )
} catch (error) {
  console.error(pc.red('[ERROR][index#main] Error caught when creating and initializing repo'))
  console.error(error)
}
