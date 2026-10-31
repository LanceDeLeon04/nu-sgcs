// Shared by api/escalate-to-director.js (called right after a student submits) and the daily job
// (api/cron-followups.js), which also retries any flagged case that was somehow missed.
//
// A concern flagged "Auto-escalate to director" (e.g. "Dean concern") goes to the DEPARTMENT DIRECTOR
// instead of the unit's own office. gc_escalate_to_director() does the database side (routing the case to
// the director, status -> Escalated, timeline entry) and only the FIRST call returns the case details,
// so the director is never emailed twice.

export async function escalateConcernCase({ supabase, origin, ref, sendEmail }) {
  const { data, error } = await supabase.rpc('gc_escalate_to_director', { p_ref: ref })
  if (error) throw error
  if (!data || !data.escalated) return { escalated: false, reason: data?.reason || 'unknown' }
  if (data.already) return { escalated: true, already: true }

  await sendEmail({
    type: 'director_escalation',
    reason: 'concern',
    to: data.to_email,
    referenceNo: data.reference_no,
    subject: data.subject,
    summary: data.description,
    code: data.code,
    officeUrl: `${origin}/office/${data.reference_no}`,
    itemType: data.type,
    department: data.department, unit: data.unit, concern: data.concern,
    incidentDate: data.incident_date, incidentLocation: data.incident_location,
    respondent: data.respondent, desiredOutcome: data.desired_outcome,
    isAnonymous: data.is_anonymous,
    complainantName: data.complainant_name, studentId: data.student_id,
    complainantEmail: data.complainant_email, contactNo: data.contact_no,
    program: data.program, yearLevel: data.year_level,
  })
  return { escalated: true, emailed: true }
}
