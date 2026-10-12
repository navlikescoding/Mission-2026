// The signs we recognize. Edit this list once the team agrees on the final signs.
//
// id:    the name sent in the 'sign' event (teammates' code uses these, so keep them stable)
// label: what the recording page shows
// hands: 1 or 2 — how many hands the sign uses. Check each sign against the official
//        ISLRTC dictionary videos and fix these values; the recorder only captures a
//        sample when this many hands are visible.

export const SIGNS = [
  { id: 'medicine',  label: 'Medicine',  hands: 1 },
  { id: 'pain',      label: 'Pain',      hands: 1 },
  { id: 'fever',     label: 'Fever',     hands: 1 },
  { id: 'headache',  label: 'Headache',  hands: 1 },
  { id: 'how much',  label: 'How much',  hands: 1 },
  { id: 'yes',       label: 'Yes',       hands: 1 },
  { id: 'no',        label: 'No',        hands: 1 },
  { id: 'thank you', label: 'Thank you', hands: 1 },
  { id: 'help',      label: 'Help',      hands: 1 },
  { id: 'water',     label: 'Water',     hands: 1 },
  { id: 'doctor',    label: 'Doctor',    hands: 1 },
  { id: 'again',     label: 'Again',     hands: 1 },

  // Hands visible but not signing (resting, scratching, reaching). Recording this teaches
  // the classifier to say "none" instead of forcing a random hand into a real sign.
  { id: 'none',      label: 'No sign (hands resting / moving)', hands: 1 }
];

export const TARGET_SAMPLES = 30; // per sign, per person
