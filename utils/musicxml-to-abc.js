const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

function decodeXml(str = '') {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function getTagValue(xml, tagName) {
    const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? decodeXml(match[1].trim()) : null;
}

function keyFromFifths(fifthsValue) {
    const fifths = Number(fifthsValue || 0);
    if (Number.isNaN(fifths)) return 'C';
    if (fifths >= 0) return SHARP_KEYS[Math.min(fifths, SHARP_KEYS.length - 1)];
    return FLAT_KEYS[Math.min(Math.abs(fifths), FLAT_KEYS.length - 1)];
}

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        const temp = y;
        y = x % y;
        x = temp;
    }
    return x || 1;
}

function ratioToFraction(ratio) {
    const precision = 1000;
    const numerator = Math.round(ratio * precision);
    const denominator = precision;
    const divisor = gcd(numerator, denominator);
    return {
        numerator: numerator / divisor,
        denominator: denominator / divisor
    };
}

function fractionToAbcDuration(numerator, denominator) {
    if (denominator === 1) return String(numerator);
    if (numerator === 1) return denominator === 2 ? '/' : `/${denominator}`;
    return `${numerator}/${denominator}`;
}

function parseDurationToAbc(duration, divisions, baseQuarterUnits = 1) {
    const safeDuration = Number(duration || divisions);
    const safeDivisions = Number(divisions || 1) || 1;
    const safeBaseQuarterUnits = Number(baseQuarterUnits || 1) || 1;

    // Convert MusicXML duration units to quarter-note units.
    const quarterUnits = safeDuration / safeDivisions;
    const ratio = quarterUnits / safeBaseQuarterUnits;

    if (!Number.isFinite(ratio) || ratio <= 0) return '';
    if (Math.abs(ratio - 1) < 1e-6) return '';
    if (Math.abs(ratio - Math.round(ratio)) < 1e-6) return String(Math.round(ratio));

    const { numerator, denominator } = ratioToFraction(ratio);
    return fractionToAbcDuration(numerator, denominator);
}

function pitchToAbc(step, alter, octave) {
    const safeStep = (step || 'C').toUpperCase();
    const safeOctave = Number(octave || 4);
    const safeAlter = Number(alter || 0);

    const accidental = safeAlter === 1 ? '^' : safeAlter === -1 ? '_' : '';
    let letter = safeStep;
    let suffix = '';

    if (safeOctave > 4) {
        letter = safeStep.toLowerCase();
        suffix = "'".repeat(Math.max(0, safeOctave - 5));
    } else if (safeOctave < 4) {
        suffix = ','.repeat(Math.max(0, 4 - safeOctave));
    }

    return `${accidental}${letter}${suffix}`;
}

function extractFirstPart(xml) {
    const partMatch = xml.match(/<part\b[^>]*>([\s\S]*?)<\/part>/i);
    return partMatch ? partMatch[1] : null;
}

function extractMeasures(partXml) {
    const measures = [];
    const regex = /<measure\b[^>]*>([\s\S]*?)<\/measure>/gi;
    let match;

    while ((match = regex.exec(partXml)) !== null) {
        measures.push(match[1]);
    }

    return measures;
}

function chooseBaseQuarterUnits(durations, fallbackDivisions) {
    const safeDurations = durations.filter((duration) => Number.isFinite(duration) && duration > 0);
    if (safeDurations.length === 0) return 1;

    const safeDivisions = Number(fallbackDivisions || 1) || 1;
    const standardBases = [1, 0.5, 0.25, 0.125, 0.0625];

    let maxPowerOfTwoDenominator = 1;
    for (const duration of safeDurations) {
        const { denominator } = ratioToFraction(duration / safeDivisions);
        let powerOfTwoDenominator = 1;
        while (powerOfTwoDenominator < denominator && powerOfTwoDenominator < 16) {
            powerOfTwoDenominator *= 2;
        }
        maxPowerOfTwoDenominator = Math.max(maxPowerOfTwoDenominator, powerOfTwoDenominator);
    }

    return standardBases.find((baseQuarterUnits) => (1 / baseQuarterUnits) === maxPowerOfTwoDenominator) || 0.0625;
}

function quarterUnitsToAbcLength(baseQuarterUnits) {
    const safeBase = Number(baseQuarterUnits || 1) || 1;
    const wholeNoteDenominator = Math.round(4 / safeBase);
    if (Number.isFinite(wholeNoteDenominator) && wholeNoteDenominator > 0) {
        return `1/${wholeNoteDenominator}`;
    }

    const wholeNoteRatio = safeBase / 4;
    const { numerator, denominator } = ratioToFraction(wholeNoteRatio);
    return `${numerator}/${denominator}`;
}

function parseNotesFromMeasure(measureXml, divisions, baseQuarterUnits) {
    const noteRegex = /<note\b[^>]*>([\s\S]*?)<\/note>/gi;
    let noteMatch;
    const notes = [];

    while ((noteMatch = noteRegex.exec(measureXml)) !== null) {
        const noteXml = noteMatch[1];
        if (/<chord\s*\/?>/i.test(noteXml)) {
            // Chord handling can be added in a future pass.
            continue;
        }

        const duration = getTagValue(noteXml, 'duration');
        const durationAbc = parseDurationToAbc(duration, divisions, baseQuarterUnits);

        if (/<rest\s*\/?>/i.test(noteXml) || /<rest>/i.test(noteXml)) {
            notes.push(`z${durationAbc}`);
            continue;
        }

        const step = getTagValue(noteXml, 'step');
        const alter = getTagValue(noteXml, 'alter');
        const octave = getTagValue(noteXml, 'octave');
        const pitchAbc = pitchToAbc(step, alter, octave);
        notes.push(`${pitchAbc}${durationAbc}`);
    }

    return notes;
}

function musicXmlToAbc(xmlString) {
    if (!xmlString || typeof xmlString !== 'string') {
        throw new Error('MusicXML content is empty');
    }

    const partXml = extractFirstPart(xmlString);
    if (!partXml) {
        throw new Error('No <part> found in MusicXML');
    }

    const workTitle = getTagValue(xmlString, 'work-title');
    const movementTitle = getTagValue(xmlString, 'movement-title');
    const title = workTitle || movementTitle || 'Imported PDF Score';
    const composer = getTagValue(xmlString, 'creator') || 'Unknown';

    const firstMeasure = extractMeasures(partXml)[0] || '';
    const beats = getTagValue(firstMeasure, 'beats') || '4';
    const beatType = getTagValue(firstMeasure, 'beat-type') || '4';
    const fifths = getTagValue(firstMeasure, 'fifths') || '0';
    const divisions = Number(getTagValue(firstMeasure, 'divisions') || 1) || 1;
    const key = keyFromFifths(fifths);

    const measures = extractMeasures(partXml);
    const rawDurations = [];
    for (const measureXml of measures) {
        const noteRegex = /<note\b[^>]*>([\s\S]*?)<\/note>/gi;
        let noteMatch;
        while ((noteMatch = noteRegex.exec(measureXml)) !== null) {
            const duration = Number(getTagValue(noteMatch[1], 'duration'));
            if (Number.isFinite(duration) && duration > 0) {
                rawDurations.push(duration);
            }
        }
    }

    const baseQuarterUnits = chooseBaseQuarterUnits(rawDurations, divisions);
    const defaultNoteLength = quarterUnitsToAbcLength(baseQuarterUnits);
    const abcMeasureLines = measures.map((measureXml) => {
        const notes = parseNotesFromMeasure(measureXml, divisions, baseQuarterUnits);
        return notes.length > 0 ? notes.join(' ') : 'z4';
    });

    const body = `${abcMeasureLines.join(' | ')} |]`;

    return `X:1
T:${title}
C:${composer}
M:${beats}/${beatType}
L:${defaultNoteLength}
K:${key}
${body}`;
}

module.exports = {
    musicXmlToAbc,
    // exported for focused tests/sanity checks
    _internal: {
        keyFromFifths,
        parseDurationToAbc,
        pitchToAbc,
        chooseBaseQuarterUnits,
        quarterUnitsToAbcLength
    }
};
