import React from 'react'
import { FEEDBACK_NOTICE } from '../lib/constants.js'

// Highlights the key phrase so students see why a formal complaint is the option that gets results.
export const KEY_PHRASE = 'actual resolutions and trackable actions'

export function Highlight({ children = KEY_PHRASE }) {
  return <strong className="font-bold text-nublue-600">{children}</strong>
}

// FEEDBACK_NOTICE with the key phrase in bold NU blue
export function FeedbackNoticeText() {
  const i = FEEDBACK_NOTICE.indexOf(KEY_PHRASE)
  if (i === -1) return <>{FEEDBACK_NOTICE}</>
  return (
    <>
      {FEEDBACK_NOTICE.slice(0, i)}
      <Highlight />
      {FEEDBACK_NOTICE.slice(i + KEY_PHRASE.length)}
    </>
  )
}
