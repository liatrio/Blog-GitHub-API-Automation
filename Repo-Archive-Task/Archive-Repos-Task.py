import logging
import datetime
import sys
from github import Github
from github import GithubException

log = logging.getLogger(__name__)

log.setLevel(logging.DEBUG)  # Set the logging level

# Create a StreamHandler that outputs to stdout
stdout_handler = logging.StreamHandler(sys.stdout)
log.addHandler(stdout_handler)


# Returns True if the repo should not be archived. This is determined by
# checking if the repo has a .NOARCHIVE file, any topics, is older than 6 months
# old, or any commits in the last 3 months.
def repo_marked_noarchive(repo):
    # First, we check if the repo has a .NOARCHIVE file. If it does, we return
    # True.
    try:
        noarchive_status = repo.get_contents(".NOARCHIVE")

        if noarchive_status:
            return True
    except GithubException:
        log.error(f"[ERROR]: No .NOARCHIVE file found in {repo.full_name}.")

    # Next, we check if the repo has any topics. If it does, we return True.
    try:
        repo_topics = repo.get_topics()

        if len(repo_topics) > 0:
            return True
    except GithubException:
        log.error(f"[ERROR]: Unable to get tags from repo {repo.full_name}.")

    # Finally, we check if the repo was created over 6 months ago and has commit
    # activity in the last 3 months. If it does, we return True.
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        six_months_ago = now - datetime.timedelta(days=180)
        three_months_ago = now - datetime.timedelta(days=90)

        # Check if the repo is younger than 6 months old. If it is, we return
        # True.
        if repo.created_at <= six_months_ago:
            return True

        # Get all commits in the last 3 months.
        commits = repo.get_commits(since=three_months_ago)

        # If there are any commits returned, we return True.
        if commits.totalCount > 0:
            return True
    except GithubException:
        log.error(f"[ERROR]: Failed to get commits for repository {repo.name}.")

    return False


gh = Github("<access_token>")

for repo in gh.get_user().get_repos():
    if repo_marked_noarchive(repo):
        log.info(f"[INFO]: Skipping {repo.full_name}.")
        continue

    log.info(f"[INFO]: Archiving {repo.full_name}.")

    try:
        repo.edit(archived=True)
        # repo.delete()
    except GithubException:
        log.error(f"[ERROR]: Unable to archive {repo.full_name}.")
        continue

    log.info(f"[INFO]: Deleted {repo.full_name}.")
