export const AIRCRAFT_METADATA_RENEWAL_TITLE =
  'Aircraft metadata snapshot renewal'

const stageMarker = (stage) =>
  `<!-- aircraft-metadata-renewal-stage:${stage} -->`

export const buildAircraftMetadataRenewalBody = ({
  outputVersion,
  publishedAt,
  expiresAt,
  warningStage,
}) => {
  const marker = stageMarker(warningStage)
  const expiry = new Date(expiresAt).toISOString()

  return [
    marker,
    'A reviewed aircraft metadata snapshot renewal is due.',
    '',
    `- Current immutable snapshot: \`${outputVersion}\``,
    `- Source publication time: \`${publishedAt}\``,
    `- Valid through: \`${expiry}\` (UTC)`,
    `- Reminder stage: **${warningStage}**`,
    '',
    'Review the pinned source publication, license, checksums, and projection before renewal. When approved, run `npm run update:aircraft-metadata`, validate the new immutable output, and submit it through the normal checked release path. Do not extend the age limit or remove prior version assets.',
  ].join('\n')
}

export const planAircraftMetadataRenewalIssue = ({
  assessment,
  issue,
  outputVersion,
  publishedAt,
  assignee,
}) => {
  if (assessment.warningStage === 'fresh') {
    if (!issue || issue.state !== 'open') return { action: 'none' }

    return {
      action: 'close',
      body: [
        stageMarker('resolved'),
        `Renewal reminder resolved by current snapshot \`${outputVersion}\`.`,
        `Publication time: \`${publishedAt}\`.`,
      ].join('\n'),
    }
  }

  const body = buildAircraftMetadataRenewalBody({
    outputVersion,
    publishedAt,
    expiresAt: assessment.expiresAt,
    warningStage: assessment.warningStage,
  })
  if (!issue) return { action: 'create', body }
  const needsAssignment = !issue.assignees?.some(
    (currentAssignee) => currentAssignee.login === assignee,
  )
  if (issue.state !== 'open') {
    return { action: 'reopen', body, needsAssignment }
  }
  if (issue.body !== body) return { action: 'update', body, needsAssignment }
  if (needsAssignment) return { action: 'assign' }

  return { action: 'none' }
}
