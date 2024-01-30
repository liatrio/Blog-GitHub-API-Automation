# GitHub API Automation

This repository is a companion to the **GitHub API — Automate Everything!** post from the [Liatrio blog][0].

It provides two examples on how you can make use of the GitHub API to enhance your automation abilities.

## Repo Archive Task

This task is a Python script that's run once a month using GitHub Actions to archive any repos that meet a set criteria. In our case, the criteria is as follows:

- Must not have a `.NOARCHIVE` file in the root of the repo.
- Must have been more than 6 months since creation.
- Must not have had a commit in the last 3 months.

## New Repo Task

This task is for creating a new repository based on a template in another repository. The separate repository is used to store the templates so that they can be updated without having to update the workflow itself.

### Templates

The two templates available are simple, but they provide a good starting point for any customizations:

- `bun` is a template to kickstart a new TypeScript project using [the Bun runtime][1].
- `elysia` is a template to kickstart a new API using [the Elysia framework][2].

[0]: https://www.liatrio.com/blog
[1]: https://bun.sh
[2]: https://elysiajs.com
