// A small, curated safety dataset. NOT a clinical drug database — it exists to
// demonstrate decision support: when a medication is added we surface obvious
// allergy cross-reactivity and a few well-known interaction pairs. Warnings are
// advisory only and never block saving.

// Allergy → drug cross-reactivity. If the patient is allergic to something
// matching `allergy`, and the new drug matches one of `drugs`, warn.
const CROSS_REACTIVITY = [
    { allergy: ['penicillin', 'penicilina'], drugs: ['amoxicillin', 'amoxicilin', 'ampicillin', 'augmentin', 'penicillin'], label: 'penicillins' },
    { allergy: ['sulfonamide', 'sulfa', 'sulfamethoxazole', 'cotrimoxazole', 'biseptol'], drugs: ['sulfamethoxazole', 'cotrimoxazole', 'biseptol', 'sulfasalazine'], label: 'sulfonamides' },
    { allergy: ['aspirin', 'aspirina', 'nsaid', 'ibuprofen'], drugs: ['ibuprofen', 'naproxen', 'diclofenac', 'ketoprofen', 'aspirin'], label: 'NSAIDs' },
    { allergy: ['cephalosporin', 'cefalexin', 'ceftriaxone'], drugs: ['cephalexin', 'cefalexin', 'ceftriaxone', 'cefuroxime'], label: 'cephalosporins' },
];

// Drug ↔ drug interaction pairs. If the new drug matches `a` and an existing
// medication matches `b` (or vice versa), warn.
const INTERACTION_PAIRS = [
    { a: ['warfarin'], b: ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac'], message: 'Increased bleeding risk when combined with NSAIDs/aspirin.' },
    { a: ['warfarin'], b: ['amiodarone'], message: 'Amiodarone raises warfarin levels — bleeding risk.' },
    { a: ['methotrexate'], b: ['ibuprofen', 'naproxen', 'aspirin', 'diclofenac'], message: 'NSAIDs increase methotrexate toxicity.' },
    { a: ['lisinopril', 'enalapril', 'ramipril', 'ace inhibitor'], b: ['spironolactone', 'potassium', 'amiloride'], message: 'Risk of high potassium (hyperkalemia).' },
    { a: ['simvastatin', 'atorvastatin'], b: ['clarithromycin', 'erythromycin', 'itraconazole'], message: 'Raises statin levels — risk of muscle damage.' },
    { a: ['levothyroxine'], b: ['calcium', 'iron', 'calciu', 'fier'], message: 'Calcium/iron reduce levothyroxine absorption — separate doses.' },
];

const norm = (s) => (s || '').toString().toLowerCase();
const matchesAny = (text, keywords) => keywords.some((k) => text.includes(k));

/**
 * Compute advisory warnings for adding `name` given the patient's existing
 * `allergies` (decrypted, each with `.substance`) and current `medications`
 * (decrypted, each with `.name`). Returns an array of human-readable strings.
 */
function checkMedication(name, allergies = [], medications = []) {
    const drug = norm(name);
    if (!drug) return [];
    const warnings = [];

    for (const a of allergies) {
        const sub = norm(a.substance);
        for (const rule of CROSS_REACTIVITY) {
            if (matchesAny(sub, rule.allergy) && matchesAny(drug, rule.drugs)) {
                warnings.push(`Patient is allergic to "${a.substance}". "${name}" belongs to the ${rule.label} group — possible cross-reactivity.`);
            }
        }
    }

    for (const m of medications) {
        const other = norm(m.name);
        for (const pair of INTERACTION_PAIRS) {
            const hit = (matchesAny(drug, pair.a) && matchesAny(other, pair.b))
                || (matchesAny(drug, pair.b) && matchesAny(other, pair.a));
            if (hit) {
                warnings.push(`"${name}" may interact with "${m.name}": ${pair.message}`);
            }
        }
    }

    return [...new Set(warnings)];
}

module.exports = { checkMedication };
