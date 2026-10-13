import type { CiMetadata } from './schema';

type Env = NodeJS.ProcessEnv;

function pick(env: Env, name: string | undefined): string | undefined {
  if (!name) return undefined;
  const v = env[name];
  return v && v.length > 0 ? v : undefined;
}

function clean(meta: CiMetadata): CiMetadata {
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) as CiMetadata;
}

/**
 * Detects the CI provider from environment variables and returns normalized build metadata.
 * Supports GitHub Actions, GitLab CI, Jenkins, CircleCI, Azure Pipelines, Bitbucket Pipelines,
 * TeamCity and Travis CI. Returns `undefined` outside CI.
 *
 * @public
 */
export function detectCi(env: Env = process.env): CiMetadata | undefined {
  if (env.GITHUB_ACTIONS === 'true') {
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const pr = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? '')?.[1];
    return clean({
      provider: 'github-actions',
      buildId: pick(env, 'GITHUB_RUN_ID'),
      buildNumber: pick(env, 'GITHUB_RUN_NUMBER'),
      buildUrl:
        env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : undefined,
      branch: pick(env, 'GITHUB_HEAD_REF') ?? pick(env, 'GITHUB_REF_NAME'),
      commitSha: pick(env, 'GITHUB_SHA'),
      pullRequest: pr,
      repository: pick(env, 'GITHUB_REPOSITORY'),
      actor: pick(env, 'GITHUB_ACTOR'),
      jobName: pick(env, 'GITHUB_JOB'),
    });
  }
  if (env.GITLAB_CI === 'true') {
    return clean({
      provider: 'gitlab-ci',
      buildId: pick(env, 'CI_PIPELINE_ID'),
      buildNumber: pick(env, 'CI_PIPELINE_IID'),
      buildUrl: pick(env, 'CI_PIPELINE_URL') ?? pick(env, 'CI_JOB_URL'),
      branch: pick(env, 'CI_COMMIT_REF_NAME'),
      commitSha: pick(env, 'CI_COMMIT_SHA'),
      pullRequest: pick(env, 'CI_MERGE_REQUEST_IID'),
      repository: pick(env, 'CI_PROJECT_PATH'),
      actor: pick(env, 'GITLAB_USER_LOGIN'),
      jobName: pick(env, 'CI_JOB_NAME'),
    });
  }
  if (env.JENKINS_URL || env.JENKINS_HOME) {
    return clean({
      provider: 'jenkins',
      buildId: pick(env, 'BUILD_ID'),
      buildNumber: pick(env, 'BUILD_NUMBER'),
      buildUrl: pick(env, 'BUILD_URL'),
      branch: pick(env, 'BRANCH_NAME') ?? pick(env, 'GIT_BRANCH'),
      commitSha: pick(env, 'GIT_COMMIT'),
      pullRequest: pick(env, 'CHANGE_ID'),
      repository: pick(env, 'GIT_URL'),
      jobName: pick(env, 'JOB_NAME'),
    });
  }
  if (env.CIRCLECI === 'true') {
    return clean({
      provider: 'circleci',
      buildId: pick(env, 'CIRCLE_WORKFLOW_ID'),
      buildNumber: pick(env, 'CIRCLE_BUILD_NUM'),
      buildUrl: pick(env, 'CIRCLE_BUILD_URL'),
      branch: pick(env, 'CIRCLE_BRANCH'),
      commitSha: pick(env, 'CIRCLE_SHA1'),
      pullRequest: /(\d+)$/.exec(env.CIRCLE_PULL_REQUEST ?? '')?.[1],
      repository: env.CIRCLE_PROJECT_USERNAME && env.CIRCLE_PROJECT_REPONAME
        ? `${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`
        : undefined,
      actor: pick(env, 'CIRCLE_USERNAME'),
      jobName: pick(env, 'CIRCLE_JOB'),
    });
  }
  if (env.TF_BUILD === 'True' || env.TF_BUILD === 'true') {
    const base = env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
    const project = env.SYSTEM_TEAMPROJECT;
    const id = env.BUILD_BUILDID;
    return clean({
      provider: 'azure-pipelines',
      buildId: id,
      buildNumber: pick(env, 'BUILD_BUILDNUMBER'),
      buildUrl: base && project && id ? `${base}${project}/_build/results?buildId=${id}` : undefined,
      branch: pick(env, 'SYSTEM_PULLREQUEST_SOURCEBRANCH') ?? pick(env, 'BUILD_SOURCEBRANCHNAME'),
      commitSha: pick(env, 'BUILD_SOURCEVERSION'),
      pullRequest: pick(env, 'SYSTEM_PULLREQUEST_PULLREQUESTNUMBER'),
      repository: pick(env, 'BUILD_REPOSITORY_NAME'),
      actor: pick(env, 'BUILD_REQUESTEDFOR'),
      jobName: pick(env, 'AGENT_JOBNAME'),
    });
  }
  if (env.BITBUCKET_BUILD_NUMBER) {
    return clean({
      provider: 'bitbucket-pipelines',
      buildId: pick(env, 'BITBUCKET_PIPELINE_UUID'),
      buildNumber: pick(env, 'BITBUCKET_BUILD_NUMBER'),
      buildUrl:
        env.BITBUCKET_WORKSPACE && env.BITBUCKET_REPO_SLUG
          ? `https://bitbucket.org/${env.BITBUCKET_WORKSPACE}/${env.BITBUCKET_REPO_SLUG}/pipelines/results/${env.BITBUCKET_BUILD_NUMBER}`
          : undefined,
      branch: pick(env, 'BITBUCKET_BRANCH'),
      commitSha: pick(env, 'BITBUCKET_COMMIT'),
      pullRequest: pick(env, 'BITBUCKET_PR_ID'),
      repository: pick(env, 'BITBUCKET_REPO_FULL_NAME'),
    });
  }
  if (env.TEAMCITY_VERSION) {
    return clean({
      provider: 'teamcity',
      buildId: pick(env, 'BUILD_NUMBER'),
      buildNumber: pick(env, 'BUILD_NUMBER'),
      branch: pick(env, 'TEAMCITY_BUILD_BRANCH'),
      commitSha: pick(env, 'BUILD_VCS_NUMBER'),
      jobName: pick(env, 'TEAMCITY_BUILDCONF_NAME'),
    });
  }
  if (env.TRAVIS === 'true') {
    const pr = env.TRAVIS_PULL_REQUEST;
    return clean({
      provider: 'travis-ci',
      buildId: pick(env, 'TRAVIS_BUILD_ID'),
      buildNumber: pick(env, 'TRAVIS_BUILD_NUMBER'),
      buildUrl: pick(env, 'TRAVIS_BUILD_WEB_URL'),
      branch: pick(env, 'TRAVIS_PULL_REQUEST_BRANCH') ?? pick(env, 'TRAVIS_BRANCH'),
      commitSha: pick(env, 'TRAVIS_COMMIT'),
      pullRequest: pr && pr !== 'false' ? pr : undefined,
      repository: pick(env, 'TRAVIS_REPO_SLUG'),
      jobName: pick(env, 'TRAVIS_JOB_NAME'),
    });
  }
  return undefined;
}
