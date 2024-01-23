import logging
import datetime
import sys
from github import Github
from github import UnknownObjectException, GithubException

log = logging.getLogger(__name__)

log.setLevel(logging.DEBUG)  # Set the logging level

# Create a StreamHandler that outputs to stdout
stdout_handler = logging.StreamHandler(sys.stdout)
log.addHandler(stdout_handler)


# Returns true if the repo has a .NOARCHIVE file or has any topics.
def repo_marked_noarchive(repo):
    try:
        noarchive_status = repo.get_contents(".NOARCHIVE")

        if noarchive_status:
            return True
    except GithubException:
        log.error(f"[ERROR]: No .NOARCHIVE file found in {repo.full_name}.")

    try:
        # Check if there are any topics
        repo_topics = repo.get_topics()
        if len(repo_topics) > 0:
            return True
    except GithubException:
        log.error(f"[ERROR]: Unable to get tags from repo {repo.full_name}.")

    return False


# Determines if a repo is over 6 months old and has no commits in the last 6 months, deeming it archivable.
def repo_is_archivable(repo):
    now = datetime.datetime.now(datetime.timezone.utc)
    six_months_ago = now - datetime.timedelta(days=180)

    log.info(f"[INFO]: Checking if {repo.full_name} is archivable.")

    # Check if the repo is older than 6 months
    if repo.created_at > six_months_ago:
        return False

    # Check if there were any commits in the last 6 months
    try:
        commits = repo.get_commits(since=six_months_ago)
        if commits.totalCount > 0:
            return False
    except GithubException:
        log.error(f"[ERROR]: Failed to get commits for repository {repo.name}.")
        return False

    return True


g = Github("<access_token>")

for repo in g.get_user().get_repos():
    if repo_marked_noarchive(repo):
        log.info(f"Skipping {repo.full_name} as it is marked noarchive.")
        continue

    if not repo_is_archivable(repo):
        log.info(
            f"Skipping {repo.full_name} as it is not old enough or has commits in the last 6 months."
        )
        continue

    log.info(f"[INFO]: Deleting {repo.full_name}.")

    try:
        repo.edit(archived=True)
        # repo.delete()
    except GithubException:
        log.error(f"[ERROR]: Unable to archive {repo.full_name}.")
        continue

    log.info(f"[INFO]: Deleted {repo.full_name}.")
