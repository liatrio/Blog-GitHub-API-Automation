import core from '@actions/core'
import github from '@actions/github'
import { Chalk } from 'chalk'
import nj from 'nunjucks'
import path from 'path'
import { fileURLToPath } from 'url'

// #region Types
export type RepoTeamName = 'Platform' | 'Frontend' | 'Backend' | 'DevOps' | 'QA' | 'Design'

export type RepoType = 'Bun' | 'Elysia-API' | 'Elysia-Plugin'

export type RepoTeam = {
  name: string
  description: string
}

export type RepoTeams = {
  [key in RepoTeamName]: RepoTeam
}

export type UserInput = {
  repoName: string
  repoTeam: RepoTeam
  repoType?: RepoType
  repoTopics?: string[]
  repoDescription?: string
}
// #endregion Types

// #region Constants
// Create a new Chalk instance to colorize console output.
export const chalk = new Chalk({ level: 3 })

// Maps to the process.env.GITHUB_TOKEN secret.
export const ApiToken = process.env.GITHUB_TOKEN || process.env.GH_PAT

if (!ApiToken) {
  throw new Error(
    'GitHub Access Token not found in environment, must be set as GITHUB_TOKEN or GH_PAT.',
  )
}

// Create a new GitHub client using the GITHUB_TOKEN secret.
export const gh = github.getOctokit(ApiToken)

export const TemplateDetails = {
  repo: 'New-Repo-Service-Job-Template',
  path: 'README.njk',
}

export const RepoTeams: RepoTeams = {
  Backend: {
    name: 'Backend',
    description: 'Backend Team',
  },
  Design: {
    name: 'Design',
    description: 'Design Team',
  },
  DevOps: {
    name: 'DevOps',
    description: 'DevOps Team',
  },
  Frontend: {
    name: 'Frontend',
    description: 'Frontend Team',
  },
  Platform: {
    name: 'Platform',
    description: 'Platform Team',
  },
  QA: {
    name: 'QA',
    description: 'QA Team',
  },
}

export const __dirname = path.dirname(fileURLToPath(import.meta.url))
// #endregion Constants

// #region Functions
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

async function createReadMe(userInput: UserInput, owner: string): Promise<string> {
  // Get the README file for the /New-Repo-Job directory.
  const readMeTemplate = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: '/README.njk',
    owner,
  })

  if (readMeTemplate.status !== 200) throw new Error('README template not found')

  // Log some response details from the GitHub API.
  console.log(chalk.gray(`[INFO] README Template Status: ${readMeTemplate.status}`))

  // Decode the README template file contents.
  const decodedReadMeTemplate = Buffer.from(
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.content.toString(),
    // @ts-ignore For some reason the types are wrong on this, so we need to ignore it.
    readMeTemplate.data.encoding,
  ).toString()

  return nj.renderString(decodedReadMeTemplate, userInput)
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
  core.notice('Test Notice...', {title: 'Test Notice Title' })

  // Get the built README file content.
  const builtReadMe = await createReadMe(userInput, owner)

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
  console.log(
    chalk.gray(`[INFO] Repo Create Data: ${JSON.stringify(createRepoRes.data, null, 2)}`),
  )

  // Replace the topics on the new repository using the GitHub API.
  const topicsRes = await gh.rest.repos.replaceAllTopics({
    names: userInput.repoTopics || [],
    repo: userInput.repoName,
    owner,
  })

  // Log some response details from the GitHub API.
  console.log(chalk.gray(`[INFO] Topics Response Status: ${topicsRes.status}`))
  console.log(
    chalk.gray(`[INFO] Topics Response Data: ${JSON.stringify(topicsRes.data, null, 2)}`),
  )

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
    chalk.gray(
      `[INFO] Add README Response Data: ${JSON.stringify(updateReadMeRes.data, null, 2)}`,
    ),
  )

  const tmpFiles = await gh.rest.repos.getContent({
    repo: 'Blog-GitHub-API-Automation-Template',
    path: '/.github',
    owner,
  })
  
  const 
} catch (error) {
  console.error(chalk.red('[ERROR] Error caught when creating and initializing repo'))
  console.error(error)

  // @ts-ignore
  core.setFailed(error.message)
}
