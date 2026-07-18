// features/tools/TuningAssistantScreen.js
// IMRC 5-Section Turn Solver
// Source-backed quick RC tuning helper focused only on solving one corner.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  InfoText,
  Segmented,
  ToolButton,
  ToolCard,
  ToolScaffold,
  ToolSectionTitle,
  TOOL_CARD_2,
  TOOL_GREEN,
  TOOL_LINE,
  TOOL_MUTED,
  TOOL_TEXT,
  goBack,
} from './ToolShared';

const STORAGE_KEY = '@imrcToolsTurnSolver_v2';

const DEFAULT_STATE = { classStyle: 'pan', sectionId: 'in', feel: 'tight' };

const SOURCES = {
  cc: '[C&C] Oval SK Setup Guide',
  s513: '[513] Setup Basics for 513 T-Plate / WGT',
  bb: '[BB] Oval Pan Car Black Book',
  otb: '[OTB] Oval Turning Basics',
  fe: '[FE] Front End Setup',
  tek: '[TEK] Tekno RC Set Up Guide',
  bug: '[BUG] PetitRC Buggy Setup Guide',
  cx: '[CX] CompetitionX RC Quick Setup Guide',
  sd: '[SD] So Dialed RC Setup Troubleshooting',
  eo: '[EO] Essential Off-road RC Racer’s Guide',
  xray: '[XRAY] XRAY / HUDY Off-road Set-up Book',
};

const CLASS_OPTIONS = [
  { label: 'Pan-Car', value: 'pan' },
  { label: '2WD', value: '2wd' },
  { label: '4WD', value: '4wd' },
  { label: 'SCT', value: 'sct' },
];

const CLASS_NOTES = {
  pan: 'Oval Pan-Car: source-backed from the provided oval Pan-Car sheet.',
  '2wd': '2WD Buggy: rear grip first, then add steering only where the turn needs it.',
  '4wd': '4WD Buggy: balance front bite, rear support, diff action, and bars.',
  sct: 'SCT: higher CG/body roll. Keep it smooth and avoid traction roll.',
};

const CLASS_SOURCE_KEYS = {
  pan: ['cc', 's513', 'bb', 'otb', 'fe'],
  '2wd': ['tek', 'bug', 'cx', 'sd', 'eo', 'xray'],
  '4wd': ['tek', 'bug', 'cx', 'sd', 'eo', 'xray'],
  sct: ['tek', 'bug', 'cx', 'sd', 'eo'],
};

const SECTION_META = [
  { id: 'in', number: 1, label: 'IN', color: '#ff7a00' },
  { id: 'in_center', number: 2, label: 'IN TO CENTER', color: '#f6b000' },
  { id: 'center', number: 3, label: 'CENTER', color: '#48b93c' },
  { id: 'center_out', number: 4, label: 'CENTER TO OUT', color: '#2295e7' },
  { id: 'out', number: 5, label: 'OUT', color: '#5b5b5b' },
];

const SECTION_BASE = {
  in: {
    focus: 'First input / brake / roll-in',
    action: 'This is where the car first points into the corner.',
    tightFeels: ['Won’t get to bottom', 'Needs extra wheel', 'Scrubs speed'],
    looseFeels: ['Rear rotates too fast', 'Snaps before taking a set'],
    affects: 'IN changes also change IN TO CENTER because they decide how the car takes a set.',
  },
  in_center: {
    focus: 'Car taking a set',
    action: 'Weight transfer builds and the car rotates toward the apex.',
    tightFeels: ['Turns in then stalls', 'Drifts up before apex'],
    looseFeels: ['Rotates too much before center', 'Needs to be caught'],
    affects: 'IN TO CENTER changes carry into CENTER and can make the apex sharper or safer.',
  },
  center: {
    focus: 'Apex / max side load',
    action: 'This is minimum speed and the highest side load section.',
    tightFeels: ['Cannot hold apex', 'Front tires scrub'],
    looseFeels: ['Slides sideways', 'Wants to spin while coasting'],
    affects: 'CENTER changes usually affect both IN TO CENTER and CENTER TO OUT.',
  },
  center_out: {
    focus: 'Throttle pickup',
    action: 'Throttle starts coming in and the car begins to drive off the corner.',
    tightFeels: ['Won’t rotate off', 'Must wait to throttle'],
    looseFeels: ['Rear steps out on throttle pickup'],
    affects: 'CENTER TO OUT changes also change OUT because they decide how early you can pick up throttle.',
  },
  out: {
    focus: 'Exit / unwind',
    action: 'The car straightens and drives onto the straight.',
    tightFeels: ['Drives to the wall', 'Scrubs and exits lazy'],
    looseFeels: ['Fishtails on power', 'Loses forward bite'],
    affects: 'OUT changes can feed backward into CENTER TO OUT and change throttle pickup feel.',
  },
};

const PAN = {
  in: {
    tight: [['Check front tires and tweak first', 'Stiffen LR shock', 'Add LF weight / reduce excessive cross'], ['Soften RF spring', 'Reduce steering rate if over-driving', 'Check caster split'], ['Front toe / steering rate', 'LF camber', 'Caster split', 'LR shock', 'Cross / tweak'], 'Do not fix entry with a huge steering change. It can make center loose.', ['s513', 'cc', 'bb']],
    loose: [['Soften LR shock', 'Calm steering input', 'Stiffen RF spring'], ['Reduce LF weight', 'Raise outer damper tube mount', 'Check brake amount / drag brake'], ['LR shock', 'RF spring', 'Brake amount', 'Cross / tweak', 'Caster'], 'Do not add too much rear security or the car will push before center.', ['s513', 'cc', 'bb']],
  },
  in_center: {
    tight: [['Add LF camber', 'Use center push fixes', 'Stiffen LF spring'], ['Move LR tire in', 'Check front-end bind', 'Fine tune caster'], ['LF camber', 'LF spring', 'Center damper', 'LR tire position', 'Caster'], 'Do not chase this with throttle. The car is still setting into the turn.', ['bb', 'cc', 'fe']],
    loose: [['Reduce LF camber', 'Soften LF spring', 'Add center damper preload'], ['Use center loose fixes', 'Check front-end free movement', 'Reduce steering aggression'], ['LF camber', 'LF spring', 'Center damper', 'Front-end free movement', 'Steering rate'], 'Do not make the car lazy on entry just to hide a center-set problem.', ['bb', 'cc', 'fe']],
  },
  center: {
    tight: [['Fewer holes in center tubing', 'Stiffen LF spring', 'Move LR tire in'], ['Add center spring preload if needed', 'Check LF camber', 'Verify tweak'], ['Center tubing', 'LF spring', 'LR tire location', 'Center spring preload', 'LF camber'], 'Use small changes here. Center changes affect the whole corner.', ['cc', 'bb']],
    loose: [['More holes in center tubing', 'Soften LF spring', 'Add center damper preload'], ['Add a little tweak if generally free', 'Check pod movement', 'Check tire temps'], ['Center tubing', 'LF spring', 'Center damper preload', 'Tweak', 'Pod movement'], 'Do not over-tighten the car. It still needs to rotate off center.', ['cc', 'bb']],
  },
  center_out: {
    tight: [['Soften RR shock', 'Remove cross weight', 'Move LR tire in'], ['Add center T-plate screw', 'Check rear stagger', 'Check center shock travel'], ['RR shock', 'Cross / tweak', 'LR tire position', 'T-plate screw', 'Rear stagger'], 'Do not add steering if the car is stuck because the rear is bound up.', ['s513', 'cc', 'bb', 'otb']],
    loose: [['Stiffen RR shock', 'Move RR tire out', 'Remove center T-plate screw'], ['Add cross weight fine', 'Reduce rear stagger if needed', 'Check throttle curve'], ['RR shock', 'RR tire position', 'T-plate screw', 'Cross / tweak', 'Throttle curve'], 'Do not kill all rotation. Exit speed still matters.', ['s513', 'cc', 'bb', 'otb']],
  },
  out: {
    tight: [['Soften RR shock', 'Reduce cross / tweak', 'Move LR in'], ['Reduce excessive caster effect', 'Check rear width', 'Check battery position'], ['RR shock', 'Cross / tweak', 'Rear width', 'Battery position', 'Caster'], 'Do not make the car free just to point it. It still needs forward drive.', ['s513', 'cc', 'bb']],
    loose: [['Stiffen RR shock', 'Add cross / tweak slightly', 'Reduce rear stagger if needed'], ['Check center shock up-travel', 'Check side damper lube', 'Check rear ride height'], ['RR shock', 'Cross / tweak', 'Rear stagger', 'Center shock up-travel', 'Rear ride height'], 'Not enough tweak can feel loose and weak off.', ['s513', 'bb', 'otb']],
  },
};

const BUGGY_2WD = {
  in: {
    tight: [['Check front tires and ride height', 'Add entry steering with front camber link / lower front roll center', 'Use a little more front droop on bumpy or slow tracks'], ['Slightly more front toe-out', 'Reduce front spring/oil one step', 'Move battery slightly forward if allowed'], ['Front droop', 'Front camber link', 'Front toe-out', 'Ackermann', 'Brake strength'], 'Do not add steering before checking the rear is not unloading from too much brake.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Reduce brake strength / initial brake', 'Add rear stability with rear toe-in or rear camber link', 'Reduce front toe-out'], ['Less front droop', 'Softer rear spring/oil for entry grip', 'Move battery rearward if allowed'], ['Brake EPA', 'Rear toe-in', 'Rear camber link', 'Rear spring/oil', 'Battery position'], 'Do not tune around a dragging diff, bent hinge pin, or bad rear tire.', ['tek', 'bug', 'cx', 'sd']],
  },
  in_center: {
    tight: [['Lower front roll center / use more front camber gain', 'Check rear is not too locked-in', 'Use slightly softer front spring/oil'], ['More Ackermann if it needs low-speed steering', 'Less rear toe-in if excessive', 'Move battery forward slightly'], ['Front roll center', 'Front camber gain', 'Ackermann', 'Rear toe-in', 'Front spring/oil'], 'Do not remove too much rear toe; 2WD needs rear security off-power.', ['tek', 'cx', 'sd', 'xray']],
    loose: [['Raise front roll center / reduce front camber gain', 'Add rear side bite with rear camber link', 'Add rear toe-in if low'], ['Softer rear spring/oil', 'Less Ackermann or steering rate', 'Reduce brake drag'], ['Rear camber link', 'Rear toe-in', 'Rear spring/oil', 'Ackermann', 'Steering rate'], 'Do not make the front dull if the real problem is brake aggression.', ['tek', 'cx', 'sd', 'xray']],
  },
  center: {
    tight: [['Add front grip: lower front roll center or softer front spring', 'Free the rear slightly if it is too planted', 'Check front tire insert/compound'], ['More front camber', 'Stiffer rear spring only if track is smooth', 'Less steering speed/expo only after setup checks'], ['Front roll center', 'Front spring', 'Front camber', 'Rear spring', 'Front tire/insert'], 'Do not over-soften the front on high grip; it can traction roll or feel lazy.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Add rear side bite: lower rear roll center or softer rear spring', 'Reduce front steering aggression', 'Check rear tires first'], ['More rear toe-in if low', 'Longer rear camber link for stability', 'Softer rear oil on bumpy tracks'], ['Rear roll center', 'Rear spring', 'Rear toe-in', 'Rear camber link', 'Rear tire/insert'], 'Do not add so much rear grip that the car cannot finish the corner.', ['tek', 'bug', 'cx', 'sd']],
  },
  center_out: {
    tight: [['Check diff/slipper is not too tight', 'Try slightly less rear toe-in if excessive', 'Add a little anti-squat only on high grip'], ['Less rear droop for quicker direction change', 'Move battery forward slightly', 'Use smoother line before radio changes'], ['Rear anti-squat', 'Rear toe-in', 'Diff/slipper', 'Rear droop', 'Battery position'], 'Freeing throttle pickup can make OUT loose if forward bite is low.', ['tek', 'cx', 'sd', 'eo']],
    loose: [['Soften throttle punch / expo', 'Less anti-squat for smoother drive on loose or bumpy tracks', 'Add rear toe-in or rear droop for grip'], ['Softer rear spring/oil', 'Move battery rearward', 'Check slipper/diff action'], ['Throttle punch', 'Anti-squat', 'Rear toe-in', 'Rear droop', 'Slipper/diff'], 'Do not hide an aggressive trigger finger with too much setup security.', ['tek', 'cx', 'sd', 'eo']],
  },
  out: {
    tight: [['Free exit slightly with less rear toe-in if excessive', 'Move battery forward in small step', 'Increase on-power steering carefully'], ['Stiffer rear spring on smooth/high grip', 'Check rear hub/link position', 'Add throttle expo if pushing from over-driving'], ['Rear toe-in', 'Battery position', 'Rear spring', 'Rear hub/link', 'Throttle expo'], 'Do not remove all rear security; exit speed needs forward bite.', ['tek', 'cx', 'sd']],
    loose: [['Add rear drive: smoother throttle, more rear toe-in, or more rearward weight', 'Less anti-squat if loose/bumpy', 'Check rear tires and diff/slipper'], ['Softer rear spring/oil', 'Longer wheelbase if possible', 'More rear droop for grip'], ['Throttle punch', 'Rear toe-in', 'Anti-squat', 'Wheelbase', 'Rear droop'], 'Do not use too much rear toe if it kills rotation and speed.', ['tek', 'bug', 'cx', 'sd']],
  },
};

const BUGGY_4WD = {
  in: {
    tight: [['Add entry steering with front droop or lower front roll center', 'Check front diff is not too tight', 'Use a touch more front toe-out'], ['More Ackermann for low-speed steering', 'Softer front spring/oil', 'Check brake balance'], ['Front droop', 'Front diff', 'Front roll center', 'Ackermann', 'Front toe-out'], 'Do not over-loosen the front diff if the car becomes inconsistent on power.', ['tek', 'cx', 'sd', 'xray']],
    loose: [['Reduce brake aggression', 'Add rear stability with rear toe-in / rear roll center change', 'Reduce front toe-out or Ackermann'], ['Thicker front roll bar if high grip', 'Softer rear spring/oil for rear bite', 'Check center diff is not unloading'], ['Brake strength', 'Rear toe-in', 'Rear roll center', 'Front roll bar', 'Center diff'], 'Do not mask a bad brake setting with too many suspension changes.', ['tek', 'cx', 'sd']],
  },
  in_center: {
    tight: [['Lower front roll center or raise rear roll center for more rotation', 'Use softer front bar / stiffer rear bar if equipped', 'Check front diff gives enough pull'], ['More front camber gain', 'Softer front spring/oil', 'Less rear toe-in if excessive'], ['Front roll center', 'Rear roll center', 'Anti-roll bars', 'Front diff', 'Rear toe-in'], 'Do not make the rear too free if traction is low.', ['tek', 'cx', 'sd', 'xray']],
    loose: [['Add rear side bite: lower rear roll center or softer rear bar', 'Reduce front steering response', 'Check rear diff is not too loose/unloading'], ['More rear toe-in', 'Softer rear spring/oil', 'Less Ackermann'], ['Rear roll center', 'Rear bar', 'Rear diff', 'Rear toe-in', 'Ackermann'], 'Do not over-stiffen the front to calm the rear; it can lose bite on bumps.', ['tek', 'cx', 'sd', 'xray']],
  },
  center: {
    tight: [['Add front grip with lower front roll center or softer front bar', 'Free rear slightly with higher rear roll center or stiffer rear bar', 'Check tire balance'], ['More front camber', 'Softer front spring/oil', 'Adjust diff oils for more steering'], ['Front roll center', 'Front bar', 'Rear roll center', 'Rear bar', 'Diff oils'], 'Do not add so much front bite that the car traction rolls.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Add rear grip: lower rear roll center or softer rear bar', 'Reduce front bite / steering rate', 'Check rear tires and ride height'], ['Softer rear spring/oil', 'More rear toe-in', 'More rear camber link stability'], ['Rear roll center', 'Rear bar', 'Rear toe-in', 'Rear spring/oil', 'Steering rate'], 'Do not take away so much front that lap time dies.', ['tek', 'bug', 'cx', 'sd']],
  },
  center_out: {
    tight: [['Increase on-power steering with diff balance or lower front roll center', 'Stiffer rear bar / less rear toe if too planted', 'Add anti-squat only if track has grip'], ['Adjust front/center/rear diff oil directionally', 'Move battery forward', 'Check rear squat'], ['Center diff', 'Front diff', 'Rear diff', 'Rear bar', 'Anti-squat'], 'More on-power steering can loosen OUT if rear drive is not secure.', ['tek', 'cx', 'sd']],
    loose: [['Soften throttle punch', 'Add rear support with rear toe-in or softer rear bar', 'Use smoother diff balance'], ['Less anti-squat on loose/bumpy tracks', 'Softer rear spring/oil', 'Move battery rearward'], ['Throttle punch', 'Rear toe-in', 'Rear bar', 'Anti-squat', 'Diff oils'], 'Do not over-calm it if the car still needs to finish the corner.', ['tek', 'cx', 'sd']],
  },
  out: {
    tight: [['Free rear slightly if planted: less rear toe or stiffer rear bar', 'Tune diff balance for more on-power rotation', 'Move battery forward in small step'], ['Reduce rear ride height if too high', 'Check rear wing/body drag', 'Use more steering only after chassis fix'], ['Rear toe-in', 'Rear bar', 'Diff oils', 'Battery position', 'Rear ride height'], 'Do not remove too much rear drive or it will fishtail off.', ['tek', 'cx', 'sd']],
    loose: [['Add rear drive: smoother throttle, more rear toe, or softer rear bar', 'Check diff oils / slipper for unloading', 'Add rearward weight if needed'], ['Softer rear spring/oil', 'Less anti-squat if loose on bumps', 'Longer wheelbase if available'], ['Throttle curve', 'Rear toe-in', 'Rear bar', 'Diff oils', 'Wheelbase'], 'Do not solve exit with only throttle expo if the rear setup is wrong.', ['tek', 'bug', 'cx', 'sd']],
  },
};

const SCT = {
  in: {
    tight: [['Check front tires and ride height', 'Add front bite with front camber / softer front spring', 'Use a little more front toe-out'], ['Reduce front bar if equipped', 'Move battery forward if allowed', 'Check body not rubbing / parachuting'], ['Front camber', 'Front spring/oil', 'Front toe-out', 'Front bar', 'Battery position'], 'Do not add too much front bite if the truck starts bicycling.', ['tek', 'bug', 'cx', 'sd', 'eo']],
    loose: [['Reduce brake punch', 'Add rear toe-in / rear stability', 'Raise front roll center or reduce front steering'], ['Softer rear spring/oil', 'Move battery rearward', 'Add rear wing/body stability if available'], ['Brake punch', 'Rear toe-in', 'Rear spring/oil', 'Battery position', 'Body/wing'], 'Do not tune around a loose body, bad tire, or dragging rear hub.', ['tek', 'cx', 'sd', 'eo']],
  },
  in_center: {
    tight: [['Add front grip carefully: softer front spring/oil or lower front roll center', 'Free rear slightly if too planted', 'Check tire compound balance'], ['More front camber', 'Less rear toe if excessive', 'Control body roll if traction rolling'], ['Front spring/oil', 'Front roll center', 'Front camber', 'Rear toe-in', 'Tire balance'], 'Adding set steering can make CENTER traction-roll prone on high grip.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Add rear side bite with rear spring/oil or rear roll center change', 'Reduce front bite / steering rate', 'Check rear tire insert/compound'], ['More rear toe-in', 'Thicker rear oil if body roll is too fast', 'Raise ride height only if bottoming'], ['Rear spring/oil', 'Rear roll center', 'Rear toe-in', 'Steering rate', 'Rear tires'], 'Calming IN TO CENTER may make CENTER and EXIT push if overdone.', ['tek', 'bug', 'cx', 'sd']],
  },
  center: {
    tight: [['Add front grip but watch traction roll', 'Free rear slightly with spring/bar/roll-center choice', 'Check ride height is not too high'], ['More front camber', 'Softer front oil on rough tracks', 'Less rear toe if excessive'], ['Front camber', 'Front spring/oil', 'Rear toe-in', 'Ride height', 'Roll center'], 'Do not chase steering with height. Too tall can flip.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Lower ride height if rolling over', 'Add rear side bite with rear spring/oil / rear roll center', 'Reduce front bite'], ['More rear toe-in', 'Softer rear bar if equipped', 'Shorter tire sauce on front if high grip'], ['Ride height', 'Rear spring/oil', 'Rear roll center', 'Rear toe-in', 'Front tire prep'], 'Do not remove all grip; fix the roll while keeping corner speed.', ['tek', 'bug', 'cx', 'sd']],
  },
  center_out: {
    tight: [['Add on-power steering carefully with less rear toe or more front bite', 'Check slipper/diff is not too tight', 'Use more anti-squat only on high grip'], ['Move battery forward slightly', 'Stiffer rear spring if smooth/high grip', 'Adjust body/wing if too planted'], ['Rear toe-in', 'Slipper/diff', 'Anti-squat', 'Battery position', 'Body/wing'], 'Freeing throttle pickup can make OUT loose quickly in SCT.', ['tek', 'cx', 'sd', 'eo']],
    loose: [['Soften throttle punch', 'Add rear toe / rear grip', 'Less anti-squat on loose or bumpy tracks'], ['Softer rear spring/oil', 'Move battery rearward', 'Check slipper/diff is not unloading'], ['Throttle punch', 'Rear toe-in', 'Anti-squat', 'Rear spring/oil', 'Slipper/diff'], 'Do not solve a loose truck only with radio; check rear geometry too.', ['tek', 'cx', 'sd', 'eo']],
  },
  out: {
    tight: [['Free exit slightly: less rear toe if excessive, more on-power steering', 'Move battery forward small step', 'Check front tire not over-prepped'], ['Stiffer rear spring on smooth/high grip', 'Reduce rear wing/body drag if too planted', 'Tune slipper/diff'], ['Rear toe-in', 'Battery position', 'Front tire prep', 'Rear spring', 'Slipper/diff'], 'Do not take away all rear stability; SCT needs forward bite.', ['tek', 'bug', 'cx', 'sd']],
    loose: [['Add rear drive with smoother throttle, more rear toe, or softer rear spring/oil', 'Move battery rearward', 'Check rear tires and body stability'], ['Less anti-squat on low grip/bumpy tracks', 'Longer wheelbase if available', 'More rear wing/body stability'], ['Throttle curve', 'Rear toe-in', 'Rear spring/oil', 'Battery position', 'Body/wing'], 'Do not over-tighten the truck; it still has to finish the turn.', ['tek', 'bug', 'cx', 'sd', 'eo']],
  },
};

const CLASS_TUNING = { pan: PAN, '2wd': BUGGY_2WD, '4wd': BUGGY_4WD, sct: SCT };

const QUICK_RULES = [
  'Fix the first section where the problem starts.',
  'Make one change, test, then write down whether it helped.',
  'Tires, tweak, ride height, free suspension, and bent parts get checked before chasing setup.',
  'A change that fixes one section can hurt another section, so always re-run the full corner.',
];

function sectionMeta(sectionId) {
  return SECTION_META.find((item) => item.id === sectionId) || SECTION_META[0];
}

function makeSide(raw, baseAffects) {
  return {
    first: raw[0],
    changes: raw[1],
    more: raw[2],
    avoid: raw[3],
    sources: raw[4],
    affects: baseAffects,
  };
}

function getSection(classStyle, sectionId) {
  const base = SECTION_BASE[sectionId] || SECTION_BASE.in;
  const classTuning = CLASS_TUNING[classStyle] || CLASS_TUNING.pan;
  const tuning = classTuning[sectionId] || classTuning.in;
  return {
    ...base,
    tight: makeSide(tuning.tight, base.affects),
    loose: makeSide(tuning.loose, base.affects),
  };
}

function sourceText(keys) {
  return keys.map((key) => SOURCES[key]).filter(Boolean).join('  |  ');
}

function SectionButton({ meta, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sectionButton, selected && styles.sectionButtonSelected, pressed && styles.pressed]}>
      <View style={[styles.sectionNum, { backgroundColor: meta.color }]}><Text style={styles.sectionNumText}>{meta.number}</Text></View>
      <Text style={[styles.sectionButtonText, selected && styles.sectionButtonTextSelected]} numberOfLines={2}>{meta.label}</Text>
    </Pressable>
  );
}

function Bullet({ text, strong = false }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletMark, strong && styles.bulletMarkStrong]}>•</Text>
      <Text style={[styles.bulletText, strong && styles.bulletTextStrong]}>{text}</Text>
    </View>
  );
}

function MiniList({ title, items, tone }) {
  return (
    <View style={styles.miniBox}>
      <Text style={[styles.miniTitle, tone === 'tight' && styles.tightText, tone === 'loose' && styles.looseText]}>{title}</Text>
      {items.map((item) => <Bullet key={item} text={item} />)}
    </View>
  );
}

function MoreAdjustments({ items }) {
  return <View style={styles.adjustWrap}>{items.map((item) => <View key={item} style={styles.adjustPill}><Text style={styles.adjustPillText}>{item}</Text></View>)}</View>;
}

export default function TuningAssistantScreen(props) {
  const [state, setState] = useState(DEFAULT_STATE);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        try { setState((prev) => ({ ...prev, ...JSON.parse(raw) })); } catch {}
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => { AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {}); }, [state]);

  const meta = useMemo(() => sectionMeta(state.sectionId), [state.sectionId]);
  const section = useMemo(() => getSection(state.classStyle, state.sectionId), [state.classStyle, state.sectionId]);
  const side = state.feel === 'tight' ? section.tight : section.loose;
  const feelTitle = state.feel === 'tight' ? 'Tight / Push Fix' : 'Loose Fix';
  const classTitle = CLASS_OPTIONS.find((item) => item.value === state.classStyle)?.label || 'Pan-Car';

  return (
    <ToolScaffold title="Tuning Assistant" subtitle="5-section turn solver" onBack={() => goBack(props)}>
      <ToolCard compact>
        <ToolSectionTitle>Class Style</ToolSectionTitle>
        <Segmented value={state.classStyle} onChange={(classStyle) => setState((prev) => ({ ...prev, classStyle }))} options={CLASS_OPTIONS} />
        <InfoText numberOfLines={2}>{CLASS_NOTES[state.classStyle]}</InfoText>
      </ToolCard>

      <ToolCard compact style={styles.mapCard}>
        <Text style={styles.mapTitle}>Problem Solve One Turn</Text>
        <Text style={styles.mapSubtitle}>Pick the first section where the car acts wrong.</Text>
        <View style={styles.sectionRow}>{SECTION_META.map((item) => <SectionButton key={item.id} meta={item} selected={state.sectionId === item.id} onPress={() => setState((prev) => ({ ...prev, sectionId: item.id }))} />)}</View>
      </ToolCard>

      <ToolCard compact>
        <ToolSectionTitle>What does it feel like?</ToolSectionTitle>
        <Segmented value={state.feel} onChange={(feel) => setState((prev) => ({ ...prev, feel }))} options={[{ label: 'Tight / Push', value: 'tight' }, { label: 'Loose', value: 'loose' }]} />
        <View style={styles.currentSection}>
          <View style={[styles.currentNumber, { backgroundColor: meta.color }]}><Text style={styles.currentNumberText}>{meta.number}</Text></View>
          <View style={styles.currentTextWrap}>
            <Text style={styles.currentLabel}>{classTitle} • {meta.label}</Text>
            <Text style={styles.currentFocus}>{section.focus}</Text>
          </View>
        </View>
        <Text style={styles.actionText}>{section.action}</Text>
        <View style={styles.feelBoxes}>
          <MiniList title="Tight / push feels like" items={section.tightFeels} tone="tight" />
          <MiniList title="Loose feels like" items={section.looseFeels} tone="loose" />
        </View>
      </ToolCard>

      <ToolCard compact style={styles.answerCard}>
        <Text style={styles.answerTitle}>{feelTitle}</Text>
        <Text style={styles.answerSection}>{classTitle} • Section {meta.number}: {meta.label}</Text>

        <View style={styles.subHeader}><Text style={styles.subHeaderText}>First checks</Text></View>
        {side.first.map((item) => <Bullet key={item} text={item} strong />)}

        <View style={styles.subHeader}><Text style={styles.subHeaderText}>Next changes</Text></View>
        {side.changes.map((item) => <Bullet key={item} text={item} />)}

        <View style={styles.subHeader}><Text style={styles.subHeaderText}>More things to adjust</Text></View>
        <MoreAdjustments items={side.more} />

        <View style={styles.affectBox}>
          <Text style={styles.affectLabel}>Changing this also changes</Text>
          <Text style={styles.affectText}>{side.affects}</Text>
        </View>

        <View style={styles.avoidBox}><Text style={styles.avoidLabel}>Avoid</Text><Text style={styles.avoidText}>{side.avoid}</Text></View>
        <View style={styles.sourceBox}><Text style={styles.sourceLabel}>Source</Text><Text style={styles.sourceText}>{sourceText(side.sources)}</Text></View>
      </ToolCard>

      <ToolCard compact><ToolSectionTitle>Quick Rules</ToolSectionTitle>{QUICK_RULES.map((item) => <Bullet key={item} text={item} />)}</ToolCard>
      <ToolCard compact><ToolSectionTitle>Source Key</ToolSectionTitle>{(CLASS_SOURCE_KEYS[state.classStyle] || CLASS_SOURCE_KEYS.pan).map((key) => <Text key={key} style={styles.sourceKeyLine}>• {SOURCES[key]}</Text>)}</ToolCard>
      <ToolButton label="Reset Solver" secondary onPress={() => setState(DEFAULT_STATE)} />
    </ToolScaffold>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  mapCard: {
    backgroundColor: TOOL_CARD_2,
    borderColor: 'rgba(38,217,109,0.22)',
  },
  mapTitle: {
    color: TOOL_TEXT,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  mapSubtitle: {
    color: TOOL_MUTED,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 1,
    marginBottom: 6,
  },

  sectionRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sectionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(244,255,248,0.08)',
  },
  sectionButtonSelected: {
    backgroundColor: 'rgba(38,217,109,0.11)',
    borderColor: TOOL_LINE,
  },
  sectionNum: {
    width: 23,
    height: 23,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  sectionNumText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
  },
  sectionButtonText: {
    color: TOOL_MUTED,
    fontSize: 8.4,
    lineHeight: 9.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  sectionButtonTextSelected: {
    color: TOOL_GREEN,
  },

  currentSection: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  currentNumber: {
    width: 29,
    height: 29,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentNumberText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
  },
  currentTextWrap: {
    flex: 1,
  },
  currentLabel: {
    color: TOOL_TEXT,
    fontSize: 13.5,
    lineHeight: 16,
    fontWeight: '900',
  },
  currentFocus: {
    color: TOOL_MUTED,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '800',
    marginTop: 0,
  },
  actionText: {
    color: TOOL_MUTED,
    fontSize: 10.8,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 6,
  },

  feelBoxes: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  miniBox: {
    flex: 1,
    borderRadius: 10,
    padding: 7,
    backgroundColor: 'rgba(255,255,255,0.032)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.075)',
  },
  miniTitle: {
    color: TOOL_GREEN,
    fontSize: 9.8,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  tightText: {
    color: '#ffd66b',
  },
  looseText: {
    color: '#ff9797',
  },

  answerCard: {
    backgroundColor: TOOL_CARD_2,
    borderColor: 'rgba(38,217,109,0.26)',
  },
  answerTitle: {
    color: TOOL_GREEN,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
  },
  answerSection: {
    color: TOOL_MUTED,
    fontSize: 10.8,
    lineHeight: 13,
    fontWeight: '900',
    marginTop: 0,
  },

  subHeader: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(38,217,109,0.09)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  subHeaderText: {
    color: TOOL_GREEN,
    fontSize: 9.8,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  bulletRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  bulletMark: {
    color: TOOL_GREEN,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    width: 8,
    textAlign: 'center',
  },
  bulletMarkStrong: {
    color: '#ffd66b',
  },
  bulletText: {
    flex: 1,
    color: TOOL_MUTED,
    fontSize: 10.7,
    lineHeight: 14,
    fontWeight: '800',
  },
  bulletTextStrong: {
    color: TOOL_TEXT,
  },

  adjustWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 0,
  },
  adjustPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    backgroundColor: 'rgba(38,217,109,0.09)',
    borderWidth: 1,
    borderColor: TOOL_LINE,
  },
  adjustPillText: {
    color: TOOL_GREEN,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '900',
  },

  affectBox: {
    marginTop: 7,
    borderRadius: 10,
    padding: 7,
    backgroundColor: 'rgba(38,217,109,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(38,217,109,0.22)',
  },
  affectLabel: {
    color: TOOL_GREEN,
    fontSize: 9.3,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  affectText: {
    color: TOOL_TEXT,
    fontSize: 10.8,
    lineHeight: 14,
    fontWeight: '900',
  },

  avoidBox: {
    marginTop: 6,
    borderRadius: 10,
    padding: 7,
    backgroundColor: 'rgba(255,214,107,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.22)',
  },
  avoidLabel: {
    color: '#ffd66b',
    fontSize: 9.3,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  avoidText: {
    color: '#ffd66b',
    fontSize: 10.8,
    lineHeight: 14,
    fontWeight: '900',
  },

  sourceBox: {
    marginTop: 6,
    borderRadius: 10,
    padding: 7,
    backgroundColor: 'rgba(255,255,255,0.032)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.075)',
  },
  sourceLabel: {
    color: TOOL_MUTED,
    fontSize: 9.3,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  sourceText: {
    color: TOOL_TEXT,
    fontSize: 9.8,
    lineHeight: 13,
    fontWeight: '800',
  },
  sourceKeyLine: {
    color: TOOL_MUTED,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    marginBottom: 1,
  },
});

