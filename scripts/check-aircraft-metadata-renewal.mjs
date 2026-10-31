import { appendFile } from 'node:fs/promises'
import sourceSettings from '../src/config/aircraftMetadataSource.json' with {
  type: 'json',
}
import { assessAircraftMetadataAge } from './aircraft-metadata-age.mjs'
import {
  AIRCRAFT_METADATA_RENEWAL_TITLE,
  planAircraftMetadataRenewalIssue,
} from './aircraft-metadata-renewal.mjs'

const apiBase = 'https://api.github.com'
const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const assignee = process.env.AIRCRAFT_METADATA_RENEWAL_ASSIGNEE

if (!/^[^/]+\/[^/]+$/.test(repository ?? '')) {
  throw new Error('GITHUB_REPOSITORY must be set to owner/repository')
}
if (!token) throw new Error('GITHUB_TOKEN is required')
if (!assignee) {
  throw new Error('AIRCRAFT_METADATA_RENEWAL_ASSIGNEE is required')
}

const request = async (endpoint, { method = 'GET', body } = {}) => {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const responseBody = await response.text()
    throw new Error(
      `GitHub API ${method} ${endpoint} failed with HTTP ${response.status}: ${responseBody}`,
    )
  }
  return response.status === 204 ? undefined : response.json()
}

const findRenewalIssue = async () => {
  const query = `repo:${repository} is:issue in:title "${AIRCRAFT_METADATA_RENEWAL_TITLE}"`
  const results = await request(
    `/search/issues?q=${encodeURIComponent(query)}&per_page=100`,
  )
  const matches = results.items.filter(
    (issue) =>
      issue.title === AIRCRAFT_METADATA_RENEWAL_TITLE &&
      !issue.pull_request,
  )

  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} aircraft metadata renewal issues; resolve duplicates before retrying`,
    )
  }
  return matches[0]
}

const assessment = assessAircraftMetadataAge({
  publishedAt: sourceSettings.source.publishedAt,
  staleAfterDays: sourceSettings.projection.staleAfterDays,
  futureToleranceHours: sourceSettings.projection.futureToleranceHours,
  now: Date.now(),
})
if (assessment.isFutureDated) {
  throw new Error('Aircraft metadata publication date is materially future-dated')
}

const issue = await findRenewalIssue()
const plan = planAircraftMetadataRenewalIssue({
  assessment,
  issue: issue
    ? {
        state: issue.state,
        body: issue.body,
        assignees: issue.assignees,
      }
    : undefined,
  outputVersion: sourceSettings.projection.outputVersion,
  publishedAt: sourceSettings.source.publishedAt,
  assignee,
})

let result
if (plan.action === 'create') {
  result = await request(`/repos/${repository}/issues`, {
    method: 'POST',
    body: {
      title: AIRCRAFT_METADATA_RENEWAL_TITLE,
      body: plan.body,
      assignees: [assignee],
    },
  })
} else if (plan.action === 'update') {
  result = await request(`/repos/${repository}/issues/${issue.number}`, {
    method: 'PATCH',
    body: { body: plan.body },
  })
} else if (plan.action === 'reopen') {
  result = await request(`/repos/${repository}/issues/${issue.number}`, {
    method: 'PATCH',
    body: { state: 'open', body: plan.body },
  })
} else if (plan.action === 'close') {
  result = await request(`/repos/${repository}/issues/${issue.number}`, {
    method: 'PATCH',
    body: { state: 'closed', body: plan.body },
  })
}

if (plan.needsAssignment || plan.action === 'assign') {
  result = await request(
    `/repos/${repository}/issues/${issue.number}/assignees`,
    {
      method: 'POST',
      body: { assignees: [assignee] },
    },
  )
}

const actionSummary =
  plan.action === 'none'
    ? 'No issue change was needed.'
    : `Issue action: ${plan.action}${result?.html_url ? ` ([#${result.number}](${result.html_url}))` : ''}.`
const summary = [
  '## Aircraft metadata renewal status',
  '',
  `- Snapshot: \`${sourceSettings.projection.outputVersion}\``,
  `- Published: \`${sourceSettings.source.publishedAt}\``,
  `- Valid through: \`${new Date(assessment.expiresAt).toISOString()}\` (UTC)`,
  `- Reminder stage: **${assessment.warningStage}**`,
  `- ${actionSummary}`,
  '',
].join('\n')

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
}
console.log(summary)
