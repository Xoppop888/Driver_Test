# DrivePrep — current plan

## Product direction

DrivePrep is a free, GitHub-first bilingual study app for China's driving theory exams. There are no paid modes, access codes, accounts, external database, Cloudflare Worker or premium API. The full local question bank remains in `data/questions.json`. User progress and exam history remain in the browser's persisted Zustand/localStorage state; no account or server sync is introduced.

## Design direction

Keep the existing editorial roadbook visual language: warm paper background, ink panels, coral accent, generous typography, compact rounded controls and clear mobile safe-area spacing. Use Russian and English equally throughout the interface. Keep the sponsor placement in the top navigation compact and visually distinct from the study controls. A WeChat support QR may only be displayed after the project owner supplies the real QR image; never synthesize or substitute a payment code.

## Current deliverable

The home page presents Practice, the 100-question Mock Exam, subject selection, a GitHub support block and a clearly labelled compact Binhai Auto sponsor link in the upper-right navigation linking to `https://binhaiauto.ru`. GitHub Pages remains the deployment target and GitHub remains the source of truth.

Practice resumes its saved position and stores the latest selected answers and unfinished multiple-choice drafts locally, so a reload restores the exact question and response state. The practice screen distinguishes session position from unique answered-question progress in the current subject's full bank. Numbered navigation uses the currently visible question list and opens the exact selected item; in mistake review it stays limited to the error list. Reviewing mistakes does not change the normal practice position.

Completed mock exams are saved locally with subject, completion time, score, and each question's selected answer and correctness. Time-expired exams are also recorded, with unattempted questions represented as unanswered. A bilingual exam-history page lists saved attempts and expands incorrect or unanswered questions with the selected answer, correct answer, and explanation. History is reachable from the app navigation, home page and exam results.

## Project structure

- `app/` owns the Next.js routes; `/exam-history` is the attempt-history entry point.
- `components/practice-client.tsx` owns practice navigation, restoring saved selections and session progress.
- `components/exam-client.tsx` owns mock-exam scoring and the creation of completed attempts, including timer expiry.
- `components/exam-history.tsx` renders persisted attempts and answer reviews.
- `components/project-promo.tsx` owns GitHub support and the compact sponsor badge.
- `lib/store.ts` owns persisted local progress, mistakes, practice positions, practice answers/drafts and exam history.
- `lib/i18n.ts` contains matching Russian and English UI strings.
- `public/manus-routes.json` mirrors the page-route set, including the history route.
