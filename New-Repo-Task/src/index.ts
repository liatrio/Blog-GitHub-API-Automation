import core from '@actions/core'
import github from '@actions/github'
import { Chalk } from 'chalk'
import nj from 'nunjucks'
import path from 'path'
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

export type RepoTeams = {
  [key in RepoTeamName]: RepoTeam
}

export type UserInput = {
  repoName: string
  repoTeam: RepoTeam
  repoType: RepoType
  repoTopics?: string[]
  repoDescription?: string
}
// #endregion Types

// #region Constants
// Create a new Chalk instance to colorize console output.
export const chalk = new Chalk({ level: 3 })

// Maps to the GITHUB_TOKEN or GH_PAT secret, if it exists.
export const ApiToken = process.env.GITHUB_TOKEN || process.env.GH_PAT

// Throw an error if the GitHub Access Token is not found in the environment.
if (!ApiToken) {
  throw new Error(
    'GitHub Access Token not found in environment, must be set as GITHUB_TOKEN or GH_PAT.',
  )
}

// Create a new GitHub client using the GITHUB_TOKEN secret.
export const gh = github.getOctokit(ApiToken)

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
 * Gets the user input from the action's inputs.
 *
 * @returns The user input.
 */
function getUserInput(): UserInput {
  const repoName = core.getInput('repo-name')
  if (!repoName) throw new Error('repo-name is required input')

  const repoTeamName = core.getInput('repo-team') as RepoTeamName
  if (!repoTeamName) throw new Error('repo-team is required input')

  const repoType = core.getInput('repo-type') as RepoType
  const repoTopics = core.getInput('repo-topics').split(',')
  const repoDescription = core.getInput('repo-description')

  return {
    repoName,
    repoTeam: RepoTeams[repoTeamName],
    repoType,
    repoTopics,
    repoDescription,
  }
}

type CreateReadMeInput = {
  userInput: UserInput
  repoType: RepoType
  owner: string
}

/**
 * Creates a new README file for a repository using the provided `userInput`, `owner`, and
 * `repoType` parameters, along with Nunjucks, to render and return the README file.
 *
 * @param input The input required to create the README file.
 *
 * @returns The rendered README file as a string.
 */
async function createReadMe(input: CreateReadMeInput): Promise<string> {
  // Get the README file for the /New-Repo-Job directory.
  const readMeTemplate = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: `${input.repoType.toLowerCase()}/README.njk`,
    owner: input.owner,
  })

  if (readMeTemplate.status !== 200) throw new Error('README template not found')

  // Log some response details from the GitHub API.
  console.debug(chalk.gray(`[DEBUG] README Template Status: ${readMeTemplate.status}`))
  core.debug(`[DEBUG] README Template Status: ${readMeTemplate.status}`)

  // Decode the README template file contents.
  const decodedReadMeTemplate = Buffer.from(
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.content.toString(),
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.encoding,
  ).toString()

  return nj.renderString(decodedReadMeTemplate, input.userInput)
}
// #endregion Functions

try {
  // Get the user input from the action's inputs.
  const userInput = getUserInput()

  // Get the owner of the repository from the context.
  const { owner } = github.context.repo

  core.info(`Creating a new repository with the following details:\n`)
  core.info(`- Name: ${userInput.repoName}`)
  core.info(`- Team: ${userInput.repoTeam.name}`)
  core.info(`- Type: ${userInput.repoType}`)
  core.info(`- Topics: ${userInput.repoTopics?.join(', ')}`)
  core.info(`- Description: ${userInput.repoDescription}`)
  core.notice('Test Notice...', { title: 'Test Notice Title' })

  // Get the built README file content.
  const builtReadMe = await createReadMe({ userInput, owner, repoType: userInput.repoType })

  // Temporarily exit to avoid actually creating the repository.
  process.exit(0)

  // Create the new repository using the GitHub API.
  const createRepoRes = await gh.rest.repos.createForAuthenticatedUser({
    // Required
    name: userInput.repoName,
    description: userInput.repoDescription,

    // Optional
    private: true,
    has_wiki: false,
    has_issues: true,
    has_projects: true,
    has_downloads: true,
    has_discussions: false,
  })

  // Log some response details from the GitHub API.
  console.log(chalk.gray(`[INFO] Repo Create Status: ${createRepoRes.status}`))
  console.log(chalk.gray(`[INFO] Repo Create Data: ${JSON.stringify(createRepoRes.data, null, 2)}`))

  // Replace the topics on the new repository using the GitHub API.
  const topicsRes = await gh.rest.repos.replaceAllTopics({
    names: userInput.repoTopics || [],
    repo: userInput.repoName,
    owner,
  })

  // Log some response details from the GitHub API.
  console.log(chalk.gray(`[INFO] Topics Response Status: ${topicsRes.status}`))
  console.log(chalk.gray(`[INFO] Topics Response Data: ${JSON.stringify(topicsRes.data, null, 2)}`))

  // Update the README file in the new repository using the GitHub API.
  const updateReadMeRes = await gh.rest.repos.createOrUpdateFileContents({
    message: 'feat: updated README with values from GitHub Action',
    content: Buffer.from(builtReadMe).toString('base64'),
    path: 'README.md',
    repo: userInput.repoName,
    owner,
  })

  // Log some response details from the GitHub API.
  console.log(chalk.gray(`[INFO] Add README Response Status: ${updateReadMeRes.status}`))
  console.log(
    chalk.gray(`[INFO] Add README Response Data: ${JSON.stringify(updateReadMeRes.data, null, 2)}`),
  )

  const tmpFiles = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: '/.github',
    owner,
  })
} catch (error) {
  console.error(chalk.red('[ERROR] Error caught when creating and initializing repo'))
  console.error(error)

  // @ts-ignore
  core.setFailed(error.message)
}
