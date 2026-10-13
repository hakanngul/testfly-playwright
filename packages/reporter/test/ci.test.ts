import { describe, expect, it } from 'vitest';
import { detectCi } from '../src/ci';

describe('detectCi', () => {
  it('returns undefined outside CI (no provider vars)', () => {
    expect(detectCi({})).toBeUndefined();
    expect(detectCi({ CI: 'true' })).toBeUndefined();
  });

  it('GitHub Actions', () => {
    expect(
      detectCi({
        GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123', GITHUB_RUN_NUMBER: '45', GITHUB_REPOSITORY: 'acme/app',
        GITHUB_REF_NAME: 'main', GITHUB_SHA: 'abc', GITHUB_ACTOR: 'hakan', GITHUB_JOB: 'e2e', GITHUB_SERVER_URL: 'https://ghe.example.com',
      }),
    ).toEqual({
      provider: 'github-actions', buildId: '123', buildNumber: '45', buildUrl: 'https://ghe.example.com/acme/app/actions/runs/123',
      branch: 'main', commitSha: 'abc', repository: 'acme/app', actor: 'hakan', jobName: 'e2e',
    });
  });

  it('GitHub Actions: PR number from ref, head ref as branch, default server URL', () => {
    const m = detectCi({ GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/pull/77/merge', GITHUB_HEAD_REF: 'feature/x', GITHUB_REF_NAME: '77/merge', GITHUB_REPOSITORY: 'a/b', GITHUB_RUN_ID: '9' })!;
    expect(m.pullRequest).toBe('77');
    expect(m.branch).toBe('feature/x');
    expect(m.buildUrl).toBe('https://github.com/a/b/actions/runs/9');
  });

  it('omits undefined fields (no undefined keys) and ignores empty strings', () => {
    const m = detectCi({ GITHUB_ACTIONS: 'true', GITHUB_SHA: '' })!;
    expect(m).toEqual({ provider: 'github-actions' });
    expect(Object.keys(m)).toEqual(['provider']);
  });

  it('GitLab CI', () => {
    expect(
      detectCi({
        GITLAB_CI: 'true', CI_PIPELINE_ID: '1', CI_PIPELINE_IID: '2', CI_PIPELINE_URL: 'https://gl/p/1', CI_COMMIT_REF_NAME: 'dev',
        CI_COMMIT_SHA: 'sha', CI_MERGE_REQUEST_IID: '5', CI_PROJECT_PATH: 'g/p', GITLAB_USER_LOGIN: 'u', CI_JOB_NAME: 'test',
      }),
    ).toEqual({ provider: 'gitlab-ci', buildId: '1', buildNumber: '2', buildUrl: 'https://gl/p/1', branch: 'dev', commitSha: 'sha', pullRequest: '5', repository: 'g/p', actor: 'u', jobName: 'test' });
  });

  it('GitLab CI falls back to the job URL', () => {
    expect(detectCi({ GITLAB_CI: 'true', CI_JOB_URL: 'https://gl/j/1' })!.buildUrl).toBe('https://gl/j/1');
  });

  it('Jenkins (by JENKINS_URL or JENKINS_HOME)', () => {
    const env = { BUILD_ID: '7', BUILD_NUMBER: '7', BUILD_URL: 'https://j/7', GIT_BRANCH: 'origin/main', GIT_COMMIT: 'c', CHANGE_ID: '12', GIT_URL: 'git@x', JOB_NAME: 'job' };
    const expected = { provider: 'jenkins', buildId: '7', buildNumber: '7', buildUrl: 'https://j/7', branch: 'origin/main', commitSha: 'c', pullRequest: '12', repository: 'git@x', jobName: 'job' };
    expect(detectCi({ JENKINS_URL: 'https://j', ...env })).toEqual(expected);
    expect(detectCi({ JENKINS_HOME: '/var/jenkins', ...env })).toEqual(expected);
    expect(detectCi({ JENKINS_URL: 'x', BRANCH_NAME: 'b', GIT_BRANCH: 'g' })!.branch).toBe('b');
  });

  it('CircleCI', () => {
    expect(
      detectCi({
        CIRCLECI: 'true', CIRCLE_WORKFLOW_ID: 'wf', CIRCLE_BUILD_NUM: '88', CIRCLE_BUILD_URL: 'https://c/88', CIRCLE_BRANCH: 'main',
        CIRCLE_SHA1: 's', CIRCLE_PULL_REQUEST: 'https://github.com/a/b/pull/31', CIRCLE_PROJECT_USERNAME: 'a', CIRCLE_PROJECT_REPONAME: 'b',
        CIRCLE_USERNAME: 'me', CIRCLE_JOB: 'build',
      }),
    ).toEqual({ provider: 'circleci', buildId: 'wf', buildNumber: '88', buildUrl: 'https://c/88', branch: 'main', commitSha: 's', pullRequest: '31', repository: 'a/b', actor: 'me', jobName: 'build' });
  });

  it('Azure Pipelines (TF_BUILD True/true)', () => {
    const env = {
      TF_BUILD: 'True', BUILD_BUILDID: '55', BUILD_BUILDNUMBER: '20260101.1', SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/org/',
      SYSTEM_TEAMPROJECT: 'proj', BUILD_SOURCEBRANCHNAME: 'main', BUILD_SOURCEVERSION: 'v', BUILD_REPOSITORY_NAME: 'repo', BUILD_REQUESTEDFOR: 'Hakan', AGENT_JOBNAME: 'Job1',
    };
    expect(detectCi(env)).toEqual({
      provider: 'azure-pipelines', buildId: '55', buildNumber: '20260101.1', buildUrl: 'https://dev.azure.com/org/proj/_build/results?buildId=55',
      branch: 'main', commitSha: 'v', repository: 'repo', actor: 'Hakan', jobName: 'Job1',
    });
    expect(detectCi({ ...env, TF_BUILD: 'true' })!.provider).toBe('azure-pipelines');
    expect(detectCi({ ...env, SYSTEM_PULLREQUEST_SOURCEBRANCH: 'refs/heads/pr', SYSTEM_PULLREQUEST_PULLREQUESTNUMBER: '4' })).toMatchObject({ branch: 'refs/heads/pr', pullRequest: '4' });
  });

  it('Bitbucket Pipelines', () => {
    expect(
      detectCi({
        BITBUCKET_BUILD_NUMBER: '12', BITBUCKET_PIPELINE_UUID: '{u}', BITBUCKET_WORKSPACE: 'ws', BITBUCKET_REPO_SLUG: 'repo',
        BITBUCKET_BRANCH: 'main', BITBUCKET_COMMIT: 'c', BITBUCKET_PR_ID: '3', BITBUCKET_REPO_FULL_NAME: 'ws/repo',
      }),
    ).toEqual({
      provider: 'bitbucket-pipelines', buildId: '{u}', buildNumber: '12', buildUrl: 'https://bitbucket.org/ws/repo/pipelines/results/12',
      branch: 'main', commitSha: 'c', pullRequest: '3', repository: 'ws/repo',
    });
  });

  it('TeamCity', () => {
    expect(detectCi({ TEAMCITY_VERSION: '2025.1', BUILD_NUMBER: '9', TEAMCITY_BUILD_BRANCH: 'main', BUILD_VCS_NUMBER: 'abc', TEAMCITY_BUILDCONF_NAME: 'E2E' })).toEqual({
      provider: 'teamcity', buildId: '9', buildNumber: '9', branch: 'main', commitSha: 'abc', jobName: 'E2E',
    });
  });

  it('Travis CI (PR "false" means no PR)', () => {
    const env = { TRAVIS: 'true', TRAVIS_BUILD_ID: '1', TRAVIS_BUILD_NUMBER: '2', TRAVIS_BUILD_WEB_URL: 'https://t/1', TRAVIS_BRANCH: 'main', TRAVIS_COMMIT: 'c', TRAVIS_REPO_SLUG: 'a/b', TRAVIS_JOB_NAME: 'j' };
    const base = detectCi({ ...env, TRAVIS_PULL_REQUEST: 'false' })!;
    expect(base).toEqual({ provider: 'travis-ci', buildId: '1', buildNumber: '2', buildUrl: 'https://t/1', branch: 'main', commitSha: 'c', repository: 'a/b', jobName: 'j' });
    expect(detectCi({ ...env, TRAVIS_PULL_REQUEST: '14', TRAVIS_PULL_REQUEST_BRANCH: 'feat' })).toMatchObject({ pullRequest: '14', branch: 'feat' });
  });

  it('GitHub takes precedence when several providers are set', () => {
    expect(detectCi({ GITHUB_ACTIONS: 'true', GITLAB_CI: 'true' })!.provider).toBe('github-actions');
  });
});
