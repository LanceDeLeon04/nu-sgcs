import React from 'react'

// Hyperlinks that open in a new tab so a half-filled form or the login gate is never lost.
const cls = 'font-bold underline text-nublue-600 hover:text-nublue-800'
export const TermsLink = ({ className = cls, children = 'Terms and Conditions' }) =>
  <a href="/terms" target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
export const PrivacyLink = ({ className = cls, children = 'Data Privacy Notice' }) =>
  <a href="/privacy" target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
