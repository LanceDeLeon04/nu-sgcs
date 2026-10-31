import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import PublicShell from '../components/PublicShell.jsx'
import { APP_NAME } from '../lib/constants.js'

// Plain-language Terms and Conditions + Data Privacy Notice (RA 10173, the Data Privacy Act of 2012).
// The wording lives here so both the public pages (/terms, /privacy) and the post-login gate stay in sync.

export const TERMS_SECTIONS = [
  ['1. About NUplift',
    `${APP_NAME} is the campus feedback and concerns portal operated by the NU Laguna Council of Leaders (COL) and developed by the School of Computer Studies - Student Council (SCS). By using it, you agree to these Terms and Conditions.`],
  ['2. Two kinds of submission',
    'Feedback is for filing and reporting only. It is forwarded to the concerned office(s) and does not receive a resolution or trackable actions. A Formal Concern is trackable: you get a private tracking code, and a representative may contact you (for example via Microsoft Teams) to confirm the details of your report.'],
  ['3. Your responsibilities',
    'Submit only information that is true to the best of your knowledge. Use respectful language; submissions containing profanity, threats, harassment or false accusations may be rejected, dismissed or referred to the proper university office. Do not upload files that are unlawful, malicious, or that you have no right to share. Keep your tracking code private: anyone who has it can view the status of your concern.'],
  ['4. Evidence files',
    'Formal Concerns require at least one evidence file (up to 3 files, JPG, PNG, WEBP or PDF, 5 MB each). Evidence is visible only to authorized staff and, where needed to resolve the case, the concerned office.'],
  ['5. How submissions are handled',
    'Submissions are reviewed by authorized Council staff and may be forwarded or reassigned to the concerned office or unit, including its unit head, so the matter can be acted on. Confidential concerns are shown only to staff who need to handle them. Resolution times depend on the office involved and are not guaranteed.'],
  ['6. Staff accounts',
    'Staff accounts are issued by Council admins only and are for official use. Staff must keep their credentials secret, access only the cases they need to handle, and keep everything they see confidential. Misuse of the system may lead to removal of access and disciplinary action.'],
  ['7. Availability and changes',
    'The portal is provided as is and may be unavailable from time to time for maintenance or technical reasons. These Terms may be updated; continued use after an update means you accept the revised Terms.'],
]

export const PRIVACY_SECTIONS = [
  ['1. Our commitment',
    `The NU Laguna Council of Leaders respects your privacy and processes personal data through ${APP_NAME} in line with the Data Privacy Act of 2012 (Republic Act No. 10173) and its Implementing Rules and Regulations.`],
  ['2. What we collect',
    'Formal Concerns: your full name, student ID, NU email, year level and program, and the details, description and evidence files you provide. Feedback: the same details are optional, and you may send feedback anonymously. Staff accounts: name, email or username, role and profile photo. We also keep case activity (status changes, replies, internal notes) as an audit trail.'],
  ['3. Why we collect it',
    'To receive, review, route, resolve and follow up on your feedback or concern; to contact you about your case; to notify the concerned office and unit head; to produce reports and statistics for the Council (weekly reports do not include reporter identity or descriptions); and to keep the system secure.'],
  ['4. Who can see it',
    'Authorized Council staff handling your case, and the concerned office or unit that your case is forwarded to. Where you flag a concern as confidential, access is limited to the staff who must handle it. We do not sell your data or use it for advertising.'],
  ['5. Service providers',
    'The system is hosted on third-party cloud services (database and file storage, web hosting, and email delivery) that process data only to run the portal.'],
  ['6. How long we keep it',
    'Records are kept only as long as needed to handle your case, meet university record-keeping requirements and resolve disputes, and are then deleted or anonymized.'],
  ['7. How we protect it',
    'Access is restricted by role, evidence files are stored privately and opened only through short-lived links, and the database enforces who can read or change each record.'],
  ['8. Your rights',
    'Under the Data Privacy Act you have the right to be informed, to access and correct your data, to object, to request erasure or blocking, to data portability, to file a complaint with the National Privacy Commission, and to claim damages where applicable. To exercise these rights, contact the NU Laguna Council of Leaders.'],
  ['9. Your consent',
    'By ticking the Data Privacy checkbox when you submit, or by choosing Agree after signing in as staff, you consent to the collection and processing described above. You may withdraw consent at any time by contacting the Council, though we may then be unable to continue handling your case.'],
]

function Doc({ icon: Icon, title, sections }) {
  const { state } = useLocation()
  return (
    <PublicShell>
      <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-nublue-50 flex items-center justify-center"><Icon className="text-nublue-600" size={20} /></div>
          <h1 className="text-2xl font-extrabold text-nublue-700">{title}</h1>
        </div>
        <p className="text-xs text-slate-400 mt-2">Last updated: October 31, 2026</p>
        <div className="mt-5 space-y-5">
          {sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="font-bold text-slate-800 text-sm">{h}</h2>
              <p className="text-sm text-slate-600 leading-relaxed mt-1">{body}</p>
            </section>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link to="/terms" className="text-nublue-600 font-semibold hover:underline">Terms and Conditions</Link>
          <Link to="/privacy" className="text-nublue-600 font-semibold hover:underline">Data Privacy Notice</Link>
          {state?.from && <Link to={state.from} className="inline-flex items-center gap-1 text-slate-500 hover:text-nublue-700"><ArrowLeft size={14} /> Back</Link>}
        </div>
      </div>
    </PublicShell>
  )
}

export const Terms = () => <Doc icon={FileText} title="Terms and Conditions" sections={TERMS_SECTIONS} />
export const Privacy = () => <Doc icon={ShieldCheck} title="Data Privacy Notice" sections={PRIVACY_SECTIONS} />
