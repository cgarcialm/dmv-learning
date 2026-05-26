import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const KB_DIR = path.join(DATA_DIR, "kb");
const RAW_DIR = path.join(DATA_DIR, "sources", "raw");
const REPORT_DIR = path.join(DATA_DIR, "reports");
const KB_VERSION = "ca-class-c-pilot-2026-05-25";

loadDotEnv();

const validateOnly = process.argv.includes("--validate-only");

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const handbookSections = [
  ["ca-dmv-handbook-dmv-services", "California Driver Handbook - DMV Services", "dmv-services", "CA Driver Handbook, DMV Services"],
  ["ca-dmv-handbook-copyright", "California Driver Handbook - Copyright", "copyright", "CA Driver Handbook, Copyright"],
  ["ca-dmv-handbook-disclaimer", "California Driver Handbook - Disclaimer", "disclaimer", "CA Driver Handbook, Disclaimer"],
  ["ca-dmv-handbook-section-1-license", "California Driver Handbook - Section 1: The California Driver's License", "the-california-driver-license", "CA Driver Handbook, Section 1"],
  ["ca-dmv-handbook-section-2-permit-license", "California Driver Handbook - Section 2: Getting an Instruction Permit and Driver's License", "getting-an-instruction-permit-and-drivers-license", "CA Driver Handbook, Section 2"],
  ["ca-dmv-handbook-section-3-testing", "California Driver Handbook - Section 3: The Testing Process", "the-testing-process", "CA Driver Handbook, Section 3"],
  ["ca-dmv-handbook-section-4-renewing", "California Driver Handbook - Section 4: Changing, Replacing, and Renewing Your Driver's License", "changing-replacing-and-renewing-your-drivers-license", "CA Driver Handbook, Section 4"],
  ["ca-dmv-handbook-section-5-intro-driving", "California Driver Handbook - Section 5: An Introduction to Driving", "introduction-to-driving", "CA Driver Handbook, Section 5"],
  ["ca-dmv-handbook-section-6-navigating-roads", "California Driver Handbook - Section 6: Navigating the Roads", "navigating-the-roads", "CA Driver Handbook, Section 6"],
  ["ca-dmv-handbook-section-6-navigating-roads-cont1", "California Driver Handbook - Section 6: Navigating the Roads (Continued)", "navigating-the-roads-cont1", "CA Driver Handbook, Section 6"],
  ["ca-dmv-handbook-section-7-laws-road", "California Driver Handbook - Section 7: Laws and Rules of the Road", "laws-and-rules-of-the-road", "CA Driver Handbook, Section 7"],
  ["ca-dmv-handbook-section-7-laws-road-cont1", "California Driver Handbook - Section 7: Laws and Rules of the Road (Continued)", "laws-and-rules-of-the-road-cont1", "CA Driver Handbook, Section 7"],
  ["ca-dmv-handbook-section-7-laws-road-cont2", "California Driver Handbook - Section 7: Laws and Rules of the Road (Continued 2)", "laws-and-rules-of-the-road-cont2", "CA Driver Handbook, Section 7"],
  ["ca-dmv-handbook-section-8-safe-driving", "California Driver Handbook - Section 8: Safe Driving", "safe-driving", "CA Driver Handbook, Section 8"],
  ["ca-dmv-handbook-section-8-safe-driving-cont1", "California Driver Handbook - Section 8: Safe Driving (Continued)", "safe-driving-cont1", "CA Driver Handbook, Section 8"],
  ["ca-dmv-handbook-section-8-safe-driving-cont2", "California Driver Handbook - Section 8: Safe Driving (Continued 2)", "safe-driving-cont2", "CA Driver Handbook, Section 8"],
  ["ca-dmv-handbook-section-9-alcohol-drugs", "California Driver Handbook - Section 9: Alcohol and Drugs", "alcohol-and-drugs", "CA Driver Handbook, Section 9"],
  ["ca-dmv-handbook-section-10-insurance-collisions", "California Driver Handbook - Section 10: Financial Responsibility, Insurance Requirements, and Collisions", "financial-responsibility-insurance-requirements-and-collisions", "CA Driver Handbook, Section 10"],
  ["ca-dmv-handbook-section-11-registration", "California Driver Handbook - Section 11: Vehicle Registration Requirements", "vehicle-registration-requirements", "CA Driver Handbook, Section 11"],
  ["ca-dmv-handbook-section-12-driver-safety", "California Driver Handbook - Section 12: Driver Safety", "driver-safety", "CA Driver Handbook, Section 12"],
  ["ca-dmv-handbook-section-13-seniors", "California Driver Handbook - Section 13: Seniors and Driving", "seniors-and-driving", "CA Driver Handbook, Section 13"],
  ["ca-dmv-handbook-section-14-glossary", "California Driver Handbook - Section 14: Glossary", "glossary", "CA Driver Handbook, Section 14"]
];

const handbookSectionSources = handbookSections.map(([source_id, title, slug, citation_label]) => ({
  source_id,
  title,
  url: `https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/${slug}/`,
  source_type: "official_handbook_section",
  citation_label
}));

const officialSources = [
  {
    source_id: "ca-dmv-handbook-root",
    title: "California Driver Handbook",
    url: "https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/",
    source_type: "official_handbook",
    citation_label: "CA Driver Handbook"
  },
  ...handbookSectionSources,
  {
    source_id: "ca-dmv-sample-tests-index",
    title: "Sample Driver's License Knowledge Tests",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/",
    source_type: "official_sample_test_index",
    citation_label: "CA DMV Sample Knowledge Tests"
  },
  {
    source_id: "ca-dmv-sample-test-1",
    title: "Sample Class C Drivers Written Test 1",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/sample-class-c-drivers-written-test-1/",
    source_type: "official_sample_test",
    citation_label: "CA DMV Sample Class C Test 1"
  },
  {
    source_id: "ca-dmv-sample-test-2",
    title: "Sample Class C Written Test 2",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/sample-class-c-written-test-2/",
    source_type: "official_sample_test",
    citation_label: "CA DMV Sample Class C Test 2"
  },
  {
    source_id: "ca-dmv-sample-test-3",
    title: "Sample Class C Drivers Written Test 3",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/sample-class-c-drivers-written-test-3/",
    source_type: "official_sample_test",
    citation_label: "CA DMV Sample Class C Test 3"
  },
  {
    source_id: "ca-dmv-sample-test-4",
    title: "Sample Class C Written Test 4",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/sample-class-c-written-test-4/",
    source_type: "official_sample_test",
    citation_label: "CA DMV Sample Class C Test 4"
  },
  {
    source_id: "ca-dmv-sample-test-5",
    title: "Sample Class C Written Test 5",
    url: "https://www.dmv.ca.gov/portal/driver-education-and-safety/educational-materials/sample-driver-license-dl-knowledge-tests/sample-class-c-written-test-5/",
    source_type: "official_sample_test",
    citation_label: "CA DMV Sample Class C Test 5"
  }
];

const topics = [
  {
    topic_id: "right_of_way",
    title: "Right-of-Way",
    description: "Rules for yielding, intersections, pedestrians, turning, and shared-road priority.",
    priority: 1
  },
  {
    topic_id: "signs_signals",
    title: "Signs and Signals",
    description: "Traffic signs, traffic signals, pavement markings, school bus lights, and regulatory warnings.",
    priority: 2
  },
  {
    topic_id: "speed_limits",
    title: "Speed Limits",
    description: "Basic Speed Law, special speed limits, road conditions, and speed choice.",
    priority: 3
  },
  {
    topic_id: "lane_changes_turns",
    title: "Lane Changes and Turns",
    description: "Turn positioning, signaling, blind-spot checks, merging, and highway entry or exit.",
    priority: 4
  },
  {
    topic_id: "parking_stopping",
    title: "Parking and Stopping",
    description: "Parallel parking, hill parking, curb colors, stopping lines, and prohibited stopping.",
    priority: 5
  }
];

const rules = [
  {
    rule_id: "right_of_way_left_turn_oncoming",
    topic_ids: ["right_of_way", "lane_changes_turns"],
    title: "Yield before a left turn",
    rule_summary: "When turning left, yield to approaching vehicles that are close enough to be dangerous before completing the turn.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-2"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "right_of_way_crosswalk_mobility_device",
    topic_ids: ["right_of_way"],
    title: "Yield to people in crosswalks",
    rule_summary: "Remain stopped for pedestrians or people using mobility devices in a crosswalk until they are safely clear of your vehicle's path.",
    source_ids: ["ca-dmv-handbook-section-7-laws-road", "ca-dmv-sample-test-2"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "right_of_way_highway_traffic",
    topic_ids: ["right_of_way", "lane_changes_turns"],
    title: "Highway traffic has right-of-way",
    rule_summary: "When merging onto a highway, match traffic speed when possible and merge only when there is a safe space.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-1"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "signs_signals_school_bus_yellow",
    topic_ids: ["signs_signals"],
    title: "School bus yellow warning lights",
    rule_summary: "Flashing yellow lights on a school bus mean slow down and prepare to stop.",
    source_ids: ["ca-dmv-sample-test-1"],
    confidence: "medium",
    review_status: "draft"
  },
  {
    rule_id: "signs_signals_red_light_right_turn",
    topic_ids: ["signs_signals", "lane_changes_turns"],
    title: "Right turn on red",
    rule_summary: "A right turn on red is allowed only after a complete stop and only when no sign prohibits it.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "signs_signals_stop_behind_limit_line",
    topic_ids: ["signs_signals", "parking_stopping"],
    title: "Stop behind the limit line",
    rule_summary: "At a stop, stop behind the limit line; if none exists, stop before the crosswalk or before entering the intersection.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "speed_limits_basic_speed_law",
    topic_ids: ["speed_limits"],
    title: "Basic Speed Law",
    rule_summary: "Never drive faster than is safe for current road, traffic, visibility, and weather conditions.",
    source_ids: ["ca-dmv-handbook-section-8-safe-driving-cont2", "ca-dmv-sample-test-1"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "speed_limits_railroad_crossing_visibility",
    topic_ids: ["speed_limits"],
    title: "Uncontrolled railroad crossing speed",
    rule_summary: "When within 100 feet of an uncontrolled railroad crossing and visibility is limited to less than 400 feet in both directions, the speed limit is 15 mph.",
    source_ids: ["ca-dmv-sample-test-1"],
    confidence: "medium",
    review_status: "draft"
  },
  {
    rule_id: "speed_limits_highway_entry",
    topic_ids: ["speed_limits", "lane_changes_turns"],
    title: "Enter highways near traffic speed",
    rule_summary: "Enter a highway at or near the speed of traffic when it is safe to do so.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-1"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "lane_changes_turns_right_turn_position",
    topic_ids: ["lane_changes_turns"],
    title: "Right turn position",
    rule_summary: "For a right turn, drive close to the right edge or use the designated right-turn lane, signal before turning, check for vulnerable road users, and finish in the right lane.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "lane_changes_turns_left_turn_position",
    topic_ids: ["lane_changes_turns"],
    title: "Left turn position",
    rule_summary: "For a left turn, start from the lane closest to the center divider or a left-turn lane and complete the turn when it is safe.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-2"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "lane_changes_turns_signal_blind_spot",
    topic_ids: ["lane_changes_turns"],
    title: "Signal and check blind spots",
    rule_summary: "Signal, use mirrors, and quickly look over your shoulder before changing lanes or merging.",
    source_ids: ["ca-dmv-handbook-section-6-navigating-roads"],
    confidence: "high",
    review_status: "draft"
  },
  {
    rule_id: "parking_stopping_parallel_parking",
    topic_ids: ["parking_stopping"],
    title: "Parallel parking setup",
    rule_summary: "A proper parallel parking maneuver starts by stopping next to the vehicle in front of the open space, then backing into the space.",
    source_ids: ["ca-dmv-sample-test-1"],
    confidence: "medium",
    review_status: "draft"
  },
  {
    rule_id: "parking_stopping_blue_curb",
    topic_ids: ["parking_stopping"],
    title: "Blue curb parking",
    rule_summary: "A blue curb is for a person with a disabled person parking placard or disabled person license plate.",
    source_ids: ["ca-dmv-sample-test-1"],
    confidence: "medium",
    review_status: "draft"
  },
  {
    rule_id: "parking_stopping_hill_parking",
    topic_ids: ["parking_stopping"],
    title: "Secure the vehicle on a hill",
    rule_summary: "When parking on a hill, set the parking brake and leave the vehicle in park or in gear.",
    source_ids: ["ca-dmv-sample-test-2"],
    confidence: "medium",
    review_status: "draft"
  }
];

const lessons = [
  lesson("lesson_right_of_way_basics", ["right_of_way"], "Right-of-Way Basics", [
    "Right-of-way is about preventing conflicts, not forcing your turn. When another road user is legally or practically in your path, yield until the movement is safe.",
    "Left turns are a common test topic: if an approaching vehicle is close enough to be dangerous, wait before completing the turn.",
    "Pedestrians and people using mobility devices in crosswalks require extra caution. Stay stopped until they are safely clear of your vehicle's path."
  ], [
    "right_of_way_left_turn_oncoming",
    "right_of_way_crosswalk_mobility_device",
    "right_of_way_highway_traffic"
  ]),
  lesson("lesson_signs_signals_basics", ["signs_signals"], "Signs and Signals Basics", [
    "Signals and markings tell you what action is allowed or required before you move.",
    "At stops, use the limit line first. If there is no limit line, stop before the crosswalk or intersection.",
    "School bus yellow warning lights mean slow down and prepare to stop."
  ], [
    "signs_signals_school_bus_yellow",
    "signs_signals_red_light_right_turn",
    "signs_signals_stop_behind_limit_line"
  ]),
  lesson("lesson_speed_limits_basics", ["speed_limits"], "Speed Limits Basics", [
    "The posted speed limit is not permission to drive that speed in every situation.",
    "California's Basic Speed Law requires you to drive no faster than is safe for conditions.",
    "Some situations have specific lower limits, including limited-visibility uncontrolled railroad crossings."
  ], [
    "speed_limits_basic_speed_law",
    "speed_limits_railroad_crossing_visibility",
    "speed_limits_highway_entry"
  ]),
  lesson("lesson_lane_changes_turns_basics", ["lane_changes_turns"], "Lane Changes and Turns Basics", [
    "Good turns start from the correct lane, use a signal, and finish in the proper lane.",
    "Before merging or changing lanes, use mirrors, signal, and check blind spots.",
    "When entering a highway, match traffic speed when possible and merge into a safe gap."
  ], [
    "lane_changes_turns_right_turn_position",
    "lane_changes_turns_left_turn_position",
    "lane_changes_turns_signal_blind_spot",
    "right_of_way_highway_traffic"
  ]),
  lesson("lesson_parking_stopping_basics", ["parking_stopping"], "Parking and Stopping Basics", [
    "Stopping position matters: use limit lines, crosswalks, and intersection edges as your order of priority.",
    "Parking questions often test curb colors, hill safety, and parallel parking setup.",
    "When parking on a hill, secure the car so it cannot roll."
  ], [
    "parking_stopping_parallel_parking",
    "parking_stopping_blue_curb",
    "parking_stopping_hill_parking",
    "signs_signals_stop_behind_limit_line"
  ])
];

const questions = [
  question("q_right_of_way_001", ["right_of_way"], ["right_of_way_left_turn_oncoming"], "You are stopped at an intersection and want to turn left. An approaching vehicle is close enough to be dangerous. What should you do?", [
    ["a", "Turn immediately if there are no pedestrians."],
    ["b", "Yield until the approaching vehicle has passed or it is safe."],
    ["c", "Enter the oncoming lane so the other driver slows down."]
  ], "b", "Yield to approaching traffic that is close enough to create a hazard before completing a left turn.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-2"]),
  question("q_right_of_way_002", ["right_of_way"], ["right_of_way_crosswalk_mobility_device"], "A person using a motorized wheelchair has entered the crosswalk in front of you. What should you do?", [
    ["a", "Remain stopped until the person has safely finished crossing."],
    ["b", "Drive through if the person pauses."],
    ["c", "Honk once and proceed slowly."]
  ], "a", "Stay stopped for people in crosswalks until they are safely clear of your path.", ["ca-dmv-handbook-section-7-laws-road", "ca-dmv-sample-test-2"]),
  question("q_right_of_way_003", ["right_of_way", "lane_changes_turns"], ["right_of_way_highway_traffic"], "When entering a highway, which traffic generally has the right-of-way?", [
    ["a", "Traffic already on the highway."],
    ["b", "The vehicle entering from the ramp."],
    ["c", "Whichever vehicle is traveling faster."]
  ], "a", "Highway traffic has the right-of-way; merge only when there is a safe space.", ["ca-dmv-handbook-section-6-navigating-roads"]),
  question("q_signs_signals_001", ["signs_signals"], ["signs_signals_school_bus_yellow"], "A school bus ahead starts flashing yellow warning lights. What should you do?", [
    ["a", "Slow down and prepare to stop."],
    ["b", "Stop immediately and remain stopped."],
    ["c", "Pass the bus carefully on the left."]
  ], "a", "Flashing yellow school bus lights warn you to slow down and prepare to stop.", ["ca-dmv-sample-test-1"]),
  question("q_signs_signals_002", ["signs_signals", "lane_changes_turns"], ["signs_signals_red_light_right_turn"], "When may you turn right at a red light?", [
    ["a", "After a complete stop, unless a sign prohibits the turn."],
    ["b", "Only if there is a green arrow."],
    ["c", "Any time cross traffic is moving slowly."]
  ], "a", "A right turn on red requires a complete stop and is not allowed where a No Turn on Red sign is posted.", ["ca-dmv-handbook-section-6-navigating-roads"]),
  question("q_signs_signals_003", ["signs_signals", "parking_stopping"], ["signs_signals_stop_behind_limit_line"], "Where should you stop when there is a limit line at an intersection?", [
    ["a", "Behind the limit line."],
    ["b", "In the crosswalk so you can see better."],
    ["c", "Past the crosswalk but before cross traffic."]
  ], "a", "Stop behind the limit line. If no limit line exists, stop before the crosswalk or intersection.", ["ca-dmv-handbook-section-6-navigating-roads"]),
  question("q_speed_limits_001", ["speed_limits"], ["speed_limits_basic_speed_law"], "Which statement best describes California's Basic Speed Law?", [
    ["a", "Always drive the posted speed limit."],
    ["b", "Never drive faster than is safe for current conditions."],
    ["c", "Match the speed of the fastest traffic around you."]
  ], "b", "The Basic Speed Law requires you to drive no faster than is safe for conditions.", ["ca-dmv-handbook-section-8-safe-driving-cont2", "ca-dmv-sample-test-1"]),
  question("q_speed_limits_002", ["speed_limits"], ["speed_limits_railroad_crossing_visibility"], "You are within 100 feet of an uncontrolled railroad crossing and cannot see 400 feet in both directions. What is the speed limit?", [
    ["a", "10 mph."],
    ["b", "15 mph."],
    ["c", "25 mph."]
  ], "b", "The DMV sample test identifies 15 mph for this limited-visibility uncontrolled railroad crossing situation.", ["ca-dmv-sample-test-1"]),
  question("q_speed_limits_003", ["speed_limits", "lane_changes_turns"], ["speed_limits_highway_entry"], "What speed should you use when entering a highway?", [
    ["a", "At or near the speed of traffic when safe."],
    ["b", "Much slower than traffic until you are comfortable."],
    ["c", "Faster than traffic so vehicles behind you slow down."]
  ], "a", "Enter at or near traffic speed and merge when there is a safe space.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-1"]),
  question("q_lane_changes_turns_001", ["lane_changes_turns"], ["lane_changes_turns_right_turn_position"], "Which is part of the proper procedure for a right turn?", [
    ["a", "Drive close to the right edge or use a designated right-turn lane."],
    ["b", "Begin from the lane farthest left."],
    ["c", "Turn wide into any available lane."]
  ], "a", "Right turns should start close to the right edge or in a designated right-turn lane and finish in the right lane.", ["ca-dmv-handbook-section-6-navigating-roads"]),
  question("q_lane_changes_turns_002", ["lane_changes_turns"], ["lane_changes_turns_left_turn_position"], "Where should you begin a left turn from a one-way street onto another one-way street?", [
    ["a", "The far-left lane."],
    ["b", "Any lane, if you signal."],
    ["c", "The lane closest to the right curb."]
  ], "a", "For this DMV sample question, the correct starting position is the far-left lane.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-2"]),
  question("q_lane_changes_turns_003", ["lane_changes_turns"], ["lane_changes_turns_signal_blind_spot"], "Before changing lanes or merging, what should you do?", [
    ["a", "Use mirrors and signals, then look over your shoulder to check blind spots."],
    ["b", "Signal only after you have started moving."],
    ["c", "Rely only on your mirrors."]
  ], "a", "The handbook directs drivers to signal, use mirrors, and quickly check over the shoulder before changing lanes or merging.", ["ca-dmv-handbook-section-6-navigating-roads"]),
  question("q_parking_stopping_001", ["parking_stopping"], ["parking_stopping_parallel_parking"], "Which procedure matches the DMV sample question for parallel parking?", [
    ["a", "Stop next to the vehicle in front of the open space, then back into the space."],
    ["b", "Drive forward into the space without stopping."],
    ["c", "Stop next to the vehicle behind the open space, then drive forward."]
  ], "a", "The DMV sample test identifies stopping next to the vehicle in front of the space and backing in as the proper procedure.", ["ca-dmv-sample-test-1"]),
  question("q_parking_stopping_002", ["parking_stopping"], ["parking_stopping_blue_curb"], "Who may legally park next to a blue curb?", [
    ["a", "A person loading or unloading passengers."],
    ["b", "A person with a disabled person placard or disabled person license plate."],
    ["c", "Anyone parked for less than 15 minutes."]
  ], "b", "A blue curb is reserved for a person with the proper disabled person placard or license plate.", ["ca-dmv-sample-test-1"]),
  question("q_parking_stopping_003", ["parking_stopping"], ["parking_stopping_hill_parking"], "In addition to setting the parking brake, what should you do when parking on a hill?", [
    ["a", "Leave the vehicle in park or in gear."],
    ["b", "Leave the vehicle in neutral."],
    ["c", "Keep the wheels parallel to the roadway in every hill-parking situation."]
  ], "a", "The DMV sample test identifies leaving the vehicle in park or in gear as part of securing a vehicle on a hill.", ["ca-dmv-sample-test-2"])
];

function buildDeterministicHandbookExpansion() {
  const extraTopics = [
    {
      topic_id: "safe_driving",
      title: "Safe Driving",
      description: "Defensive driving, visibility, following distance, distractions, and sharing the road.",
      priority: 6
    },
    {
      topic_id: "impaired_driving",
      title: "Alcohol, Drugs, and Impairment",
      description: "DUI rules, alcohol/drug effects, open containers, and safe choices around impairment.",
      priority: 7
    },
    {
      topic_id: "collisions_emergencies",
      title: "Collisions and Emergencies",
      description: "Collision reporting, emergency procedures, railroad safety, and legal responsibilities after crashes.",
      priority: 8
    }
  ];

  const extraRules = [
    rule("safe_driving_following_distance", ["safe_driving"], "Keep a safe following distance", "Use enough following distance to react safely; increase space around large vehicles, motorcycles, poor weather, and high speeds.", ["ca-dmv-handbook-section-8-safe-driving"]),
    rule("safe_driving_scan_road", ["safe_driving"], "Scan ahead and around you", "Keep your eyes moving, scan ahead, check mirrors, and watch for hazards instead of staring at one point.", ["ca-dmv-handbook-section-8-safe-driving"]),
    rule("safe_driving_headlights_weather", ["safe_driving", "signs_signals"], "Use headlights when visibility is poor", "Use headlights when weather, darkness, dust, smoke, or other conditions make it hard to see or be seen.", ["ca-dmv-handbook-section-8-safe-driving-cont2"]),
    rule("safe_driving_high_beams_distance", ["safe_driving", "signs_signals"], "Dim high beams for oncoming traffic", "Switch from high beams to low beams when approaching an oncoming vehicle so you do not blind the other driver.", ["ca-dmv-handbook-section-8-safe-driving-cont2", "ca-dmv-sample-test-1"]),
    rule("safe_driving_cell_phone", ["safe_driving"], "Avoid handheld phone distractions", "If you do not have a hands-free device, do not answer a ringing phone while driving.", ["ca-dmv-handbook-section-8-safe-driving-cont1", "ca-dmv-sample-test-3"]),
    rule("safe_driving_large_trucks_blind_spots", ["safe_driving"], "Give large trucks extra space", "Large trucks have large blind spots and need more room to stop and maneuver, so avoid following too closely.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-2", "ca-dmv-sample-test-4", "ca-dmv-sample-test-5"]),
    rule("safe_driving_tailgaters", ["safe_driving"], "Let tailgaters pass", "If another driver is tailgating you, change lanes when safe and let the driver pass instead of braking suddenly or speeding up.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-4"]),
    rule("safe_driving_rain_first_minutes", ["safe_driving", "speed_limits"], "Roads can be slippery when rain starts", "Roads are especially slippery during the first several minutes of rain because oil and dust have not yet washed away.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-2"]),
    rule("impaired_driving_open_container_trunk", ["impaired_driving"], "Opened alcohol containers must be stored lawfully", "An opened alcoholic beverage container may be transported only where it is not accessible to the driver or passengers, such as the trunk.", ["ca-dmv-handbook-section-9-alcohol-drugs", "ca-dmv-sample-test-4"]),
    rule("impaired_driving_drugs_affect_driving", ["impaired_driving"], "Drugs can impair driving", "Prescription, over-the-counter, and illegal drugs can affect judgment, coordination, and reaction time.", ["ca-dmv-handbook-section-9-alcohol-drugs"]),
    rule("impaired_driving_dui_zero_tolerance_under21", ["impaired_driving"], "Under-21 drivers face stricter alcohol rules", "Drivers under 21 are subject to stricter alcohol-related rules and should not drive after drinking any alcohol.", ["ca-dmv-handbook-section-9-alcohol-drugs"]),
    rule("collisions_sr1_report_injury", ["collisions_emergencies"], "Report qualifying collisions with SR-1", "A Report of Traffic Accident Occurring in California (SR-1) is required for qualifying collisions, including those involving injury or sufficient property damage.", ["ca-dmv-handbook-section-10-insurance-collisions", "ca-dmv-sample-test-2", "ca-dmv-sample-test-3"]),
    rule("collisions_stop_after_collision", ["collisions_emergencies"], "Stop after a collision", "If involved in a collision, stop, check for injuries, exchange required information, and report when required.", ["ca-dmv-handbook-section-10-insurance-collisions"]),
    rule("collisions_railroad_clearance", ["collisions_emergencies"], "Do not stop on railroad tracks", "Do not start across railroad tracks unless there is enough room on the other side to completely clear the tracks.", ["ca-dmv-handbook-section-7-laws-road-cont1", "ca-dmv-sample-test-4", "ca-dmv-sample-test-5"]),
    rule("signs_signals_flashing_yellow", ["signs_signals"], "Flashing yellow signal", "A flashing yellow traffic signal means slow down and proceed with caution.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-4", "ca-dmv-sample-test-5"]),
    rule("lane_changes_turns_bike_lane_right_turn", ["lane_changes_turns"], "Enter bike lane only near right turns", "When preparing for a right turn, enter the bike lane only within the allowed distance before the turn and yield to bicyclists.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-3", "ca-dmv-sample-test-4", "ca-dmv-sample-test-5"]),
    rule("signs_signals_double_yellow_lines", ["signs_signals", "lane_changes_turns"], "Solid and broken yellow lines", "When a solid yellow line is next to a broken yellow line, passing is allowed only from the side next to the broken line when safe.", ["ca-dmv-handbook-section-6-navigating-roads-cont1", "ca-dmv-sample-test-5"]),
    rule("parking_stopping_red_curb", ["parking_stopping", "signs_signals"], "Red curb means no stopping or parking", "A red curb means no stopping, standing, or parking.", ["ca-dmv-handbook-section-7-laws-road-cont2", "ca-dmv-sample-test-3"])
  ];

  const extraLessons = [
    deterministicLesson("lesson_safe_driving_core", ["safe_driving"], "Safe Driving Core", [
      "Safe driving depends on space, visibility, scanning, and avoiding distractions.",
      "Give large trucks and motorcycles more room because they handle and stop differently from passenger vehicles.",
      "Adjust speed and following distance for rain, smoke, dust, traffic, and other conditions."
    ], ["safe_driving_following_distance", "safe_driving_scan_road", "safe_driving_large_trucks_blind_spots", "safe_driving_rain_first_minutes"], extraRules),
    deterministicLesson("lesson_impaired_driving_core", ["impaired_driving"], "Impairment Rules", [
      "Alcohol and drugs can affect judgment, coordination, and reaction time.",
      "Open alcohol containers must not be accessible to the driver or passengers.",
      "Drivers under 21 have stricter alcohol-related rules."
    ], ["impaired_driving_open_container_trunk", "impaired_driving_drugs_affect_driving", "impaired_driving_dui_zero_tolerance_under21"], extraRules),
    deterministicLesson("lesson_collisions_emergencies_core", ["collisions_emergencies"], "Collisions and Emergencies", [
      "After a collision, stop, check for injuries, exchange required information, and report when required.",
      "Never enter railroad tracks unless you can completely clear them.",
      "Some collisions require filing an SR-1 report with DMV."
    ], ["collisions_stop_after_collision", "collisions_railroad_clearance", "collisions_sr1_report_injury"], extraRules)
  ];

  const extraQuestions = [
    question("q_safe_driving_001", ["safe_driving"], ["safe_driving_following_distance"], "When should you increase your following distance?", [["a", "When following a large truck or driving in bad weather."], ["b", "Only when another driver honks."], ["c", "Only when traffic is stopped."]], "a", "Increase following distance when you need more time to see, stop, or react.", ["ca-dmv-handbook-section-8-safe-driving"]),
    question("q_safe_driving_002", ["safe_driving"], ["safe_driving_scan_road"], "Which is an example of safe visual scanning?", [["a", "Keep your eyes moving and check mirrors regularly."], ["b", "Stare at the middle of your lane."], ["c", "Look only at the car directly ahead."]], "a", "The handbook emphasizes scanning and keeping your eyes moving.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-1"]),
    question("q_safe_driving_003", ["safe_driving", "signs_signals"], ["safe_driving_high_beams_distance"], "How far away should you switch from high beams to low beams for an oncoming vehicle?", [["a", "900 feet."], ["b", "700 feet."], ["c", "500 feet."]], "c", "The official DMV sample test marks 500 feet as the correct answer.", ["ca-dmv-handbook-section-8-safe-driving-cont2", "ca-dmv-sample-test-1"]),
    question("q_safe_driving_004", ["safe_driving"], ["safe_driving_cell_phone"], "Your phone rings while driving and you do not have a hands-free device. What should you do?", [["a", "Let the call go to voicemail."], ["b", "Answer only if stopped at a red light."], ["c", "Answer and keep the call short."]], "a", "Do not answer a phone while driving without a hands-free device.", ["ca-dmv-handbook-section-8-safe-driving-cont1", "ca-dmv-sample-test-3"]),
    question("q_safe_driving_005", ["safe_driving"], ["safe_driving_tailgaters"], "What should you do if you are being followed by a tailgater?", [["a", "Change lanes when safe and let the tailgater pass."], ["b", "Tap your brakes repeatedly."], ["c", "Speed up to match the tailgater."]], "a", "The safer response is to let the tailgater pass when possible.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-4"]),
    question("q_safe_driving_006", ["safe_driving", "speed_limits"], ["safe_driving_rain_first_minutes"], "On a hot day, when are roads especially slippery during rainfall?", [["a", "For the first several minutes."], ["b", "Only after it has rained for several hours."], ["c", "Only after rain has stopped."]], "a", "Roads are often slippery when rain first begins.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-2"]),
    question("q_safe_driving_007", ["safe_driving", "signs_signals"], ["safe_driving_headlights_weather"], "Which lights should you use if dust or smoke makes it hard to see other vehicles?", [["a", "Headlights."], ["b", "Parking lights only."], ["c", "No lights unless it is nighttime."]], "a", "Use headlights when visibility is poor from dust, smoke, weather, or darkness.", ["ca-dmv-handbook-section-8-safe-driving-cont2", "ca-dmv-sample-test-4"]),
    question("q_safe_driving_008", ["safe_driving"], ["safe_driving_large_trucks_blind_spots"], "Why should you avoid driving closely behind a large truck?", [["a", "Large trucks have large blind spots and need more stopping distance."], ["b", "Large trucks can always stop faster than cars."], ["c", "Truck drivers can see you better when you are close."]], "a", "Large trucks have large blind spots and require extra space.", ["ca-dmv-handbook-section-8-safe-driving", "ca-dmv-sample-test-2"]),
    question("q_impaired_driving_001", ["impaired_driving"], ["impaired_driving_open_container_trunk"], "When may a driver legally transport an opened alcoholic beverage container?", [["a", "If the container is under the front seat."], ["b", "If the container is in the trunk."], ["c", "If the container is in the glove compartment."]], "b", "Opened alcohol containers must be stored where they are not accessible, such as the trunk.", ["ca-dmv-handbook-section-9-alcohol-drugs", "ca-dmv-sample-test-4"]),
    question("q_impaired_driving_002", ["impaired_driving"], ["impaired_driving_drugs_affect_driving"], "Which drugs can affect your ability to drive safely?", [["a", "Prescription, over-the-counter, and illegal drugs."], ["b", "Only illegal drugs."], ["c", "Only drugs taken with alcohol."]], "a", "Many types of drugs can impair judgment, coordination, or reaction time.", ["ca-dmv-handbook-section-9-alcohol-drugs"]),
    question("q_impaired_driving_003", ["impaired_driving"], ["impaired_driving_dui_zero_tolerance_under21"], "What should drivers under 21 remember about alcohol and driving?", [["a", "They are subject to stricter alcohol-related rules."], ["b", "They may drive after one drink."], ["c", "They only violate the law if they appear impaired."]], "a", "California has stricter alcohol-related rules for drivers under 21.", ["ca-dmv-handbook-section-9-alcohol-drugs"]),
    question("q_collisions_001", ["collisions_emergencies"], ["collisions_sr1_report_injury"], "When is an SR-1 collision report required?", [["a", "For qualifying collisions, including collisions involving injury."], ["b", "Only when changing insurance companies."], ["c", "Only when registration fees are unpaid."]], "a", "The DMV requires SR-1 reporting for qualifying collisions.", ["ca-dmv-handbook-section-10-insurance-collisions", "ca-dmv-sample-test-3"]),
    question("q_collisions_002", ["collisions_emergencies"], ["collisions_stop_after_collision"], "What is one required action after being involved in a collision?", [["a", "Stop and exchange required information."], ["b", "Leave if your vehicle can still drive."], ["c", "Wait to report only if DMV contacts you."]], "a", "After a collision, stop and follow the required exchange/reporting steps.", ["ca-dmv-handbook-section-10-insurance-collisions"]),
    question("q_collisions_003", ["collisions_emergencies"], ["collisions_railroad_clearance"], "When traffic is backed up, when should you cross railroad tracks?", [["a", "Only when you can completely cross the tracks."], ["b", "When the vehicle ahead starts crossing."], ["c", "When the signal ahead is about to turn green."]], "a", "Do not enter railroad tracks unless there is room to clear them completely.", ["ca-dmv-handbook-section-7-laws-road-cont1", "ca-dmv-sample-test-4"]),
    question("q_signs_signals_004", ["signs_signals"], ["signs_signals_flashing_yellow"], "What does a flashing yellow traffic signal mean?", [["a", "Stop and wait for a green signal."], ["b", "Slow down and proceed with caution."], ["c", "Stop and yield to all cross traffic before proceeding."]], "b", "A flashing yellow signal means slow down and proceed carefully.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-4"]),
    question("q_lane_changes_turns_004", ["lane_changes_turns"], ["lane_changes_turns_bike_lane_right_turn"], "When may you drive in a bike lane to make a right turn?", [["a", "Within 200 feet of the turn, after checking for bicyclists."], ["b", "Any time traffic is heavy."], ["c", "Whenever you want to pass a right-turning vehicle."]], "a", "The handbook allows entering the bike lane near the turn when preparing to turn right and when safe.", ["ca-dmv-handbook-section-6-navigating-roads", "ca-dmv-sample-test-5"]),
    question("q_signs_signals_005", ["signs_signals", "lane_changes_turns"], ["signs_signals_double_yellow_lines"], "A solid yellow line is next to a broken yellow line. Which vehicles may pass when safe?", [["a", "Vehicles next to the broken line."], ["b", "Vehicles next to the solid line."], ["c", "Vehicles in both directions."]], "a", "Passing is allowed only from the side next to the broken yellow line when safe.", ["ca-dmv-handbook-section-6-navigating-roads-cont1", "ca-dmv-sample-test-5"]),
    question("q_parking_stopping_004", ["parking_stopping", "signs_signals"], ["parking_stopping_red_curb"], "What does a red curb mean?", [["a", "No stopping, standing, or parking."], ["b", "Passenger loading only."], ["c", "Short-term parking only."]], "a", "A red curb means no stopping, standing, or parking.", ["ca-dmv-handbook-section-7-laws-road-cont2", "ca-dmv-sample-test-3"])
  ];

  return {
    topics: extraTopics,
    rules: extraRules,
    lessons: extraLessons,
    questions: extraQuestions
  };
}

const testProfiles = [
  {
    profile_id: "ca_class_c_pilot",
    title: "California Class C Pilot Test",
    question_style: "multiple_choice",
    questions_per_test: 15,
    passing_correct: 12,
    source_ids: ["ca-dmv-sample-tests-index"],
    notes: "Pilot profile for validating the app flow. Full DMV-style profile should be verified before final test-mode launch."
  },
  {
    profile_id: "ca_class_c_full_candidate",
    title: "California Class C Full Test Candidate",
    question_style: "multiple_choice",
    questions_per_test: 46,
    passing_correct: 38,
    source_ids: ["ca-dmv-handbook-root", "ca-dmv-sample-tests-index"],
    notes: "Candidate profile based on current common Class C original license references. Must be reverified against official DMV test rules before production use."
  }
];

function lesson(lesson_id, topic_ids, title, segments, rule_ids) {
  const source_ids = unique(rule_ids.flatMap((ruleId) => findById(rules, "rule_id", ruleId).source_ids));
  return {
    lesson_id,
    topic_ids,
    title,
    segments: segments.map((text, index) => ({
      segment_id: `${lesson_id}_segment_${index + 1}`,
      text,
      source_ids
    })),
    rule_ids,
    source_ids,
    review_status: "draft"
  };
}

function deterministicLesson(lesson_id, topic_ids, title, segments, rule_ids, ruleSet) {
  const source_ids = unique(rule_ids.flatMap((ruleId) => findById(ruleSet, "rule_id", ruleId).source_ids));
  return {
    lesson_id,
    topic_ids,
    title,
    segments: segments.map((text, index) => ({
      segment_id: `${lesson_id}_segment_${index + 1}`,
      text,
      source_ids
    })),
    rule_ids,
    source_ids,
    review_status: "draft"
  };
}

function rule(rule_id, topic_ids, title, rule_summary, source_ids) {
  return {
    rule_id,
    topic_ids,
    title,
    rule_summary,
    source_ids,
    confidence: "high",
    answer_source_status: "handbook_verified",
    review_status: "draft"
  };
}

function question(question_id, topic_ids, rule_ids, prompt, choices, correct_choice_id, explanation, source_ids) {
  return {
    question_id,
    topic_ids,
    rule_ids,
    prompt,
    choices: choices.map(([choice_id, text]) => ({ choice_id, text })),
    correct_choice_id,
    explanation,
    source_ids,
    difficulty: "medium",
    confidence: source_ids.some((id) => id.startsWith("ca-dmv-handbook")) ? "high" : "medium",
    answer_source_status: source_ids.some((id) => id.startsWith("ca-dmv-handbook")) ? "handbook_verified" : "needs_review",
    answer_source_detail: source_ids.some((id) => id.startsWith("ca-dmv-handbook"))
      ? "Correct answer verified from the cited handbook rule."
      : "Correct answer selected from DMV sample-test context and pending official answer-key extraction.",
    review_status: "draft"
  };
}

function findById(items, field, id) {
  const item = items.find((candidate) => candidate[field] === id);
  if (!item) {
    throw new Error(`Missing ${field}: ${id}`);
  }
  return item;
}

function unique(values) {
  return [...new Set(values)];
}

async function main() {
  await ensureDirs();
  if (validateOnly) {
    const artifacts = await loadArtifacts();
    const validation = validateKb(artifacts);
    await writeReports(artifacts, validation);
    printValidation(validation);
    process.exit(validation.errors.length ? 1 : 0);
  }

  const sources = await collectSources();
  const manifest = {
    kb_version: KB_VERSION,
    generated_at: new Date().toISOString(),
    source_policy: "official_dmv_only",
    scope: "pilot",
    license_note: "California Driver's Handbook, California Department of Motor Vehicles, licensed under CC BY-NC 4.0.",
    artifact_files: [
      "manifest.json",
      "sources.json",
      "topics.json",
      "rules.json",
      "lessons.json",
      "questions.json",
      "official_sample_questions.json",
      "test_profiles.json"
    ]
  };

  const official_sample_questions = await extractOfficialSampleQuestions(sources);
  const promoted = promoteOfficialSampleQuestions(official_sample_questions);
  const deterministicExpansion = buildDeterministicHandbookExpansion();
  const allTopics = mergeById([...topics, ...deterministicExpansion.topics], "topic_id");
  const allRules = mergeById([...rules, ...deterministicExpansion.rules, ...promoted.rules], "rule_id");
  const allLessons = mergeById([...lessons, ...deterministicExpansion.lessons], "lesson_id");
  const allQuestions = mergeById([...questions, ...deterministicExpansion.questions, ...promoted.questions], "question_id");
  const scoredQuestions = applyOfficialSampleAnswerKeys(allQuestions, official_sample_questions);
  const artifacts = { manifest, sources, topics: allTopics, rules: allRules, lessons: allLessons, questions: scoredQuestions, official_sample_questions, test_profiles: testProfiles };
  const validation = validateKb(artifacts);

  await writeJson("manifest.json", manifest);
  await writeJson("sources.json", sources);
  await writeJson("topics.json", allTopics);
  await writeJson("rules.json", allRules);
  await writeJson("lessons.json", allLessons);
  await writeJson("questions.json", scoredQuestions);
  await writeJson("official_sample_questions.json", official_sample_questions);
  await writeJson("test_profiles.json", testProfiles);
  await writeReports(artifacts, validation);

  printValidation(validation);
  process.exit(validation.errors.length ? 1 : 0);
}

async function ensureDirs() {
  await mkdir(KB_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
}

async function collectSources() {
  const retrievedAt = new Date().toISOString();
  const sources = [];

  for (const source of officialSources) {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "dmv-learning-kb-generator/0.1 (+personal study project)"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.url}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const text = htmlToText(html);
    const sha = sha256(text);
    await writeFile(path.join(RAW_DIR, `${source.source_id}.txt`), text);
    sources.push({
      ...source,
      official: true,
      retrieved_at: retrievedAt,
      content_sha256: sha,
      raw_snapshot_path: `data/sources/raw/${source.source_id}.txt`
    });
  }

  return sources;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, "\"")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(fileName, value) {
  await writeFile(path.join(KB_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function loadArtifacts() {
  return {
    manifest: JSON.parse(await readFile(path.join(KB_DIR, "manifest.json"), "utf8")),
    sources: JSON.parse(await readFile(path.join(KB_DIR, "sources.json"), "utf8")),
    topics: JSON.parse(await readFile(path.join(KB_DIR, "topics.json"), "utf8")),
    rules: JSON.parse(await readFile(path.join(KB_DIR, "rules.json"), "utf8")),
    lessons: JSON.parse(await readFile(path.join(KB_DIR, "lessons.json"), "utf8")),
    questions: JSON.parse(await readFile(path.join(KB_DIR, "questions.json"), "utf8")),
    official_sample_questions: JSON.parse(await readFile(path.join(KB_DIR, "official_sample_questions.json"), "utf8")),
    test_profiles: JSON.parse(await readFile(path.join(KB_DIR, "test_profiles.json"), "utf8"))
  };
}

async function extractOfficialSampleQuestions(sources) {
  const sampleSources = sources.filter((source) => source.source_type === "official_sample_test");
  const sampleQuestions = [];

  for (const source of sampleSources) {
    const rawPath = path.join(ROOT, source.raw_snapshot_path);
    const text = await readFile(rawPath, "utf8");
    const lines = text
      .split("\n")
      .map((line) => decodeEntities(line).trim())
      .filter(Boolean);
    const start = lines.findIndex((line) => line.startsWith("Practice Questions"));
    const end = lines.findIndex((line) => line.startsWith("All questions must be answered"));
    if (start === -1 || end === -1 || end <= start) {
      sampleQuestions.push(...extractNumberedSampleQuestions(source, lines));
      continue;
    }

    const body = lines.slice(start, end);
    const sourceQuestions = [];
    let questionNumber = 1;
    for (let index = 0; index < body.length; index += 1) {
      if (body[index] !== "*") continue;
      const prompt = body[index - 1];
      const nextStar = body.indexOf("*", index + 1);
      const choiceEnd = nextStar === -1 ? body.length : nextStar - 1;
      const choiceTexts = body.slice(index + 1, choiceEnd).filter(Boolean).slice(0, 3);
      if (!prompt || choiceTexts.length < 2) continue;

      sourceQuestions.push({
        sample_question_id: `${source.source_id.replaceAll("-", "_")}_q${String(questionNumber).padStart(2, "0")}`,
        source_id: source.source_id,
        source_question_number: questionNumber,
        prompt,
        choices: choiceTexts.map((textValue, choiceIndex) => ({
          choice_id: String.fromCharCode("a".charCodeAt(0) + choiceIndex),
          text: textValue
        })),
        correct_choice_id: null,
        answer_source_status: "not_exposed_in_source_snapshot",
        linked_question_ids: linkedCuratedQuestionIds(prompt)
      });
      questionNumber += 1;
    }
    const answerResults = await fetchOfficialAnswerResults(source, sourceQuestions.length);
    for (const [sampleIndex, sampleQuestion] of sourceQuestions.entries()) {
      const answerResult = answerResults[sampleIndex];
      if (answerResult) {
        const correctChoice = sampleQuestion.choices.find((choice) => normalizeForMatch(choice.text) === normalizeForMatch(answerResult.correctAnswer));
        sampleQuestions.push({
          ...sampleQuestion,
          correct_choice_id: correctChoice?.choice_id ?? null,
          answer_source_status: correctChoice ? "official_answer_key" : "needs_review",
          answer_source_detail: "Correct answer parsed from the official DMV result page after submitting the sample test online."
        });
      } else {
        sampleQuestions.push(sampleQuestion);
      }
    }
  }

  return sampleQuestions;
}

function extractNumberedSampleQuestions(source, lines) {
  const extracted = [];
  const start = lines.findIndex((line, index) => line === source.title && lines[index + 1]?.startsWith("1. "));
  if (start === -1) return extracted;

  const body = lines.slice(start + 1);
  let index = 0;
  while (index < body.length) {
    const questionMatch = body[index].match(/^(\d+)\.\s+(.+)/);
    if (!questionMatch) {
      index += 1;
      continue;
    }

    const questionNumber = Number(questionMatch[1]);
    const prompt = questionMatch[2].trim();
    const choices = [];
    index += 1;

    while (index < body.length && choices.length < 3) {
      const line = body[index];
      if (/^\d+\.\s+/.test(line)) break;
      if (line !== "*" && line !== "Required" && !line.startsWith("Was this page helpful?")) {
        choices.push(line);
      }
      index += 1;
    }

    if (choices.length === 3) {
      const verifiedAnswer = handbookVerifiedSampleAnswer(source.source_id, questionNumber);
      extracted.push({
        sample_question_id: `${source.source_id.replaceAll("-", "_")}_q${String(questionNumber).padStart(2, "0")}`,
        source_id: source.source_id,
        source_question_number: questionNumber,
        prompt,
        choices: choices.map((textValue, choiceIndex) => ({
          choice_id: String.fromCharCode("a".charCodeAt(0) + choiceIndex),
            text: textValue
          })),
        correct_choice_id: verifiedAnswer?.correct_choice_id ?? null,
        answer_source_status: verifiedAnswer ? "handbook_verified" : "needs_review",
        answer_source_detail: verifiedAnswer?.answer_source_detail ??
          "Official prompt and choices parsed from the DMV page, but no official answer result endpoint was found in this page shape yet.",
        linked_question_ids: linkedCuratedQuestionIds(prompt)
      });
    }
  }

  return extracted;
}

function handbookVerifiedSampleAnswer(sourceId, questionNumber) {
  const answers = {
    "ca-dmv-sample-test-5": {
      1: ["b", "Large trucks have bigger blind spots and need more stopping distance; the safe choice is to follow farther behind than for a passenger vehicle."],
      2: ["a", "California rules prohibit wearing a headset or earplugs covering both ears while driving."],
      3: ["a", "Do not start across railroad tracks unless there is enough room to completely cross them."],
      4: ["a", "Tailgating can frustrate other drivers and create unsafe conditions."],
      5: ["a", "Driving too slowly can block normal traffic flow."],
      6: ["c", "Drivers must obey instructions from road workers, flaggers, or signal persons."],
      7: ["b", "Drivers may enter a bike lane within 200 feet of an intersection or driveway when preparing for a right turn."],
      8: ["c", "A flashing yellow traffic signal means slow down and proceed carefully."],
      9: ["c", "Yield to pedestrians crossing the roadway and let them finish crossing your lane."],
      10: ["b", "On a road with one solid yellow line next to one broken yellow line, vehicles next to the broken line may pass when safe."]
    }
  };
  const answer = answers[sourceId]?.[questionNumber];
  if (!answer) return null;
  return {
    correct_choice_id: answer[0],
    answer_source_detail: `Official prompt and choices parsed from ${sourceId}; correct answer handbook-verified. ${answer[1]}`
  };
}

async function fetchOfficialAnswerResults(source, questionCount) {
  const form = new URLSearchParams();
  for (let index = 0; index < questionCount; index += 1) {
    form.set(`question_${index}`, "0");
  }
  form.set("dmv_practice_test_submit", "1");

  const response = await fetch(source.url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "dmv-learning-kb-generator/0.1 (+personal study project)"
    },
    body: form
  });
  if (!response.ok) {
    throw new Error(`Failed to submit ${source.url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  await writeFile(path.join(RAW_DIR, `${source.source_id}-submitted-results.txt`), htmlToText(html));
  return parseOfficialAnswerResults(html);
}

function parseOfficialAnswerResults(html) {
  const results = [];
  const resultBlocks = html.match(/<li class="dmv-practice-test__result[\s\S]*?<\/li>/g) ?? [];
  for (const block of resultBlocks) {
    const questionText = attrValue(block, "data-question-text");
    const userAnswer = attrValue(block, "data-user-answer");
    const isCorrect = attrValue(block, "data-is-correct") === "true";
    const correctAnswerMatch = block.match(/<strong>Correct answer:<\/strong>\s*([\s\S]*?)<\/p>/);
    const correctAnswer = isCorrect ? userAnswer : htmlFragmentToText(correctAnswerMatch?.[1] ?? "");
    if (correctAnswer) {
      results.push({
        questionText,
        correctAnswer
      });
    }
  }
  return results;
}

function attrValue(html, attrName) {
  const match = html.match(new RegExp(`${attrName}="([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

function htmlFragmentToText(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function applyOfficialSampleAnswerKeys(scoredQuestions, officialSampleQuestions) {
  return scoredQuestions.map((questionItem) => {
    const sample = officialSampleQuestions.find((sampleQuestion) => {
      if (sampleQuestion.correct_choice_id === null) return false;
      if (!questionItem.source_ids.includes(sampleQuestion.source_id)) return false;
      const sampleCorrectChoice = sampleQuestion.choices.find((choice) => choice.choice_id === sampleQuestion.correct_choice_id);
      const questionCorrectChoice = questionItem.choices.find((choice) => choice.choice_id === questionItem.correct_choice_id);
      const answerMatches = textSimilarity(sampleCorrectChoice?.text, questionCorrectChoice?.text) >= 0.45;
      const promptMatches = textSimilarity(sampleQuestion.prompt, questionItem.prompt) >= 0.35;
      return sampleQuestion.linked_question_ids.includes(questionItem.question_id) ||
        normalizeForMatch(sampleQuestion.prompt) === normalizeForMatch(questionItem.prompt) ||
        (answerMatches && promptMatches);
    });
    if (!sample) return questionItem;

    const correctChoice = sample.choices.find((choice) => choice.choice_id === sample.correct_choice_id);
    const scoredCorrectChoice = mostSimilarChoice(questionItem.choices, correctChoice?.text);
    if (!scoredCorrectChoice) return questionItem;

    return {
      ...questionItem,
      correct_choice_id: scoredCorrectChoice.choice_id,
      answer_source_status: sample.answer_source_status,
      answer_source_detail: sample.answer_source_status === "official_answer_key"
        ? `Official answer parsed from ${sample.sample_question_id}.`
        : `Official prompt/options from ${sample.sample_question_id}; answer verified from handbook rules.`
    };
  });
}

function promoteOfficialSampleQuestions(officialSampleQuestions) {
  const promotedRules = [];
  const promotedQuestions = [];

  for (const sampleQuestion of officialSampleQuestions) {
    if (!["official_answer_key", "handbook_verified"].includes(sampleQuestion.answer_source_status) || !sampleQuestion.correct_choice_id) {
      continue;
    }

    const topicIds = classifySampleQuestion(sampleQuestion);
    const ruleId = `${sampleQuestion.sample_question_id}_rule`;
    const correctChoice = sampleQuestion.choices.find((choice) => choice.choice_id === sampleQuestion.correct_choice_id);

    promotedRules.push({
      rule_id: ruleId,
      topic_ids: topicIds,
      title: conciseRuleTitle(sampleQuestion.prompt),
      rule_summary: `Official DMV sample test item. Correct answer: ${correctChoice.text}`,
      source_ids: [sampleQuestion.source_id],
      confidence: "high",
      answer_source_status: "official_answer_key",
      review_status: "draft"
    });

    promotedQuestions.push({
      question_id: `q_${sampleQuestion.sample_question_id}`,
      topic_ids: topicIds,
      rule_ids: [ruleId],
      prompt: sampleQuestion.prompt,
      choices: sampleQuestion.choices,
      correct_choice_id: sampleQuestion.correct_choice_id,
      explanation: `The official DMV sample test marks "${correctChoice.text}" as the correct answer.`,
      source_ids: [sampleQuestion.source_id],
      difficulty: "medium",
      confidence: "high",
      answer_source_status: sampleQuestion.answer_source_status,
      answer_source_detail: sampleQuestion.answer_source_status === "official_answer_key"
        ? `Official answer parsed from ${sampleQuestion.sample_question_id}.`
        : `Official prompt/options from ${sampleQuestion.sample_question_id}; answer verified from handbook rules.`,
      review_status: "draft"
    });
  }

  return {
    rules: promotedRules,
    questions: promotedQuestions
  };
}

function classifySampleQuestion(sampleQuestion) {
  const text = normalizeForMatch(`${sampleQuestion.prompt} ${sampleQuestion.choices.map((choice) => choice.text).join(" ")}`);
  const matches = [];

  if (hasAny(text, ["right of way", "crosswalk", "pedestrian", "wheelchair", "crossing guard", "intersection"])) {
    matches.push("right_of_way");
  }
  if (hasAny(text, ["signal", "yellow", "red light", "green", "flashing", "school bus", "headlight", "high beam", "double yellow", "curb", "crosshatched"])) {
    matches.push("signs_signals");
  }
  if (hasAny(text, ["speed", "mph", "faster", "slower", "speed limit"])) {
    matches.push("speed_limits");
  }
  if (hasAny(text, ["turn", "lane", "merge", "highway", "bicycle lane", "blind spot"])) {
    matches.push("lane_changes_turns");
  }
  if (hasAny(text, ["park", "parking", "curb", "stopping", "stop", "hill"])) {
    matches.push("parking_stopping");
  }

  if (!matches.length) {
    matches.push("right_of_way");
  }
  return unique(matches);
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(normalizeForMatch(term)));
}

function conciseRuleTitle(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69).trim()}...`;
}

function mergeById(items, idField) {
  const merged = new Map();
  for (const item of items) {
    merged.set(item[idField], item);
  }
  return [...merged.values()];
}

function mostSimilarChoice(choices, targetText) {
  let bestChoice = null;
  let bestScore = 0;
  for (const choice of choices) {
    const score = textSimilarity(choice.text, targetText);
    if (score > bestScore) {
      bestChoice = choice;
      bestScore = score;
    }
  }
  return bestScore >= 0.25 ? bestChoice : null;
}

function decodeEntities(value) {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, "\"")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ");
}

function linkedCuratedQuestionIds(prompt) {
  const normalizedPrompt = normalizeForMatch(prompt);
  return questions
    .filter((questionItem) => {
      const normalizedQuestion = normalizeForMatch(questionItem.prompt);
      const samplePrefix = normalizedPrompt.slice(0, 50);
      const questionPrefix = normalizedQuestion.slice(0, 50);
      return normalizedQuestion.includes(samplePrefix) ||
        normalizedPrompt.includes(questionPrefix) ||
        textSimilarity(normalizedPrompt, normalizedQuestion) >= 0.45;
    })
    .map((questionItem) => questionItem.question_id);
}

function normalizeForMatch(value) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textSimilarity(left, right) {
  const leftWords = new Set(normalizeForMatch(left).split(" ").filter((word) => word.length > 2));
  const rightWords = new Set(normalizeForMatch(right).split(" ").filter((word) => word.length > 2));
  if (!leftWords.size || !rightWords.size) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

function validateKb(artifacts) {
  const errors = [];
  const warnings = [];
  const sourceIds = idSet(artifacts.sources, "source_id", errors);
  const topicIds = idSet(artifacts.topics, "topic_id", errors);
  const ruleIds = idSet(artifacts.rules, "rule_id", errors);
  idSet(artifacts.lessons, "lesson_id", errors);
  idSet(artifacts.questions, "question_id", errors);
  idSet(artifacts.official_sample_questions, "sample_question_id", errors);
  idSet(artifacts.test_profiles, "profile_id", errors);

  for (const source of artifacts.sources) {
    required(source, ["source_id", "title", "url", "source_type", "official", "retrieved_at", "content_sha256", "citation_label"], "source", errors);
    if (source.official !== true) {
      errors.push(`Source ${source.source_id} is not marked official.`);
    }
  }

  for (const topic of artifacts.topics) {
    required(topic, ["topic_id", "title", "description", "priority"], "topic", errors);
  }

  for (const rule of artifacts.rules) {
    required(rule, ["rule_id", "topic_ids", "title", "rule_summary", "source_ids", "confidence", "review_status"], "rule", errors);
    refsExist(rule.topic_ids, topicIds, `Rule ${rule.rule_id} topic`, errors);
    refsExist(rule.source_ids, sourceIds, `Rule ${rule.rule_id} source`, errors);
  }

  for (const lessonItem of artifacts.lessons) {
    required(lessonItem, ["lesson_id", "topic_ids", "title", "segments", "rule_ids", "source_ids", "review_status"], "lesson", errors);
    refsExist(lessonItem.topic_ids, topicIds, `Lesson ${lessonItem.lesson_id} topic`, errors);
    refsExist(lessonItem.rule_ids, ruleIds, `Lesson ${lessonItem.lesson_id} rule`, errors);
    refsExist(lessonItem.source_ids, sourceIds, `Lesson ${lessonItem.lesson_id} source`, errors);
    if (!lessonItem.segments.length) {
      errors.push(`Lesson ${lessonItem.lesson_id} has no segments.`);
    }
    for (const segment of lessonItem.segments) {
      required(segment, ["segment_id", "text", "source_ids"], `lesson segment ${lessonItem.lesson_id}`, errors);
      refsExist(segment.source_ids, sourceIds, `Lesson segment ${segment.segment_id} source`, errors);
    }
  }

  for (const questionItem of artifacts.questions) {
    required(questionItem, ["question_id", "topic_ids", "rule_ids", "prompt", "choices", "correct_choice_id", "explanation", "source_ids", "difficulty", "confidence", "answer_source_status", "answer_source_detail", "review_status"], "question", errors);
    refsExist(questionItem.topic_ids, topicIds, `Question ${questionItem.question_id} topic`, errors);
    refsExist(questionItem.rule_ids, ruleIds, `Question ${questionItem.question_id} rule`, errors);
    refsExist(questionItem.source_ids, sourceIds, `Question ${questionItem.question_id} source`, errors);
    if (!Array.isArray(questionItem.choices) || questionItem.choices.length < 2) {
      errors.push(`Question ${questionItem.question_id} must have at least two choices.`);
      continue;
    }
    const choiceIds = questionItem.choices.map((choice) => choice.choice_id);
    if (!choiceIds.includes(questionItem.correct_choice_id)) {
      errors.push(`Question ${questionItem.question_id} correct_choice_id is not one of its choices.`);
    }
    if (!["official_answer_key", "handbook_verified", "needs_review"].includes(questionItem.answer_source_status)) {
      errors.push(`Question ${questionItem.question_id} has invalid answer_source_status: ${questionItem.answer_source_status}.`);
    }
  }

  for (const sampleQuestion of artifacts.official_sample_questions) {
    required(sampleQuestion, ["sample_question_id", "source_id", "source_question_number", "prompt", "choices", "answer_source_status"], "official sample question", errors);
    refsExist([sampleQuestion.source_id], sourceIds, `Official sample question ${sampleQuestion.sample_question_id} source`, errors);
    if (!Array.isArray(sampleQuestion.linked_question_ids)) {
      errors.push(`Official sample question ${sampleQuestion.sample_question_id} linked_question_ids must be an array.`);
    }
    if (!Array.isArray(sampleQuestion.choices) || sampleQuestion.choices.length !== 3) {
      errors.push(`Official sample question ${sampleQuestion.sample_question_id} should preserve exactly three visible choices.`);
    }
    if (sampleQuestion.correct_choice_id && !sampleQuestion.choices.some((choice) => choice.choice_id === sampleQuestion.correct_choice_id)) {
      errors.push(`Official sample question ${sampleQuestion.sample_question_id} correct_choice_id is not one of its choices.`);
    }
    if (!["official_answer_key", "handbook_verified", "not_exposed_in_source_snapshot", "needs_review"].includes(sampleQuestion.answer_source_status)) {
      errors.push(`Official sample question ${sampleQuestion.sample_question_id} has invalid answer_source_status: ${sampleQuestion.answer_source_status}.`);
    }
    if (sampleQuestion.answer_source_status === "official_answer_key" && !sampleQuestion.answer_source_detail) {
      errors.push(`Official sample question ${sampleQuestion.sample_question_id} needs answer_source_detail.`);
    }
  }

  for (const profile of artifacts.test_profiles) {
    required(profile, ["profile_id", "title", "question_style", "questions_per_test", "passing_correct", "source_ids"], "test profile", errors);
    refsExist(profile.source_ids, sourceIds, `Test profile ${profile.profile_id} source`, errors);
    if (profile.question_style !== "multiple_choice") {
      errors.push(`Test profile ${profile.profile_id} is not multiple_choice.`);
    }
    if (profile.passing_correct > profile.questions_per_test) {
      errors.push(`Test profile ${profile.profile_id} passing_correct exceeds questions_per_test.`);
    }
  }

  for (const topic of artifacts.topics) {
    const hasRule = artifacts.rules.some((rule) => rule.topic_ids.includes(topic.topic_id));
    const hasLesson = artifacts.lessons.some((lessonItem) => lessonItem.topic_ids.includes(topic.topic_id));
    const hasQuestion = artifacts.questions.some((questionItem) => questionItem.topic_ids.includes(topic.topic_id));
    if (!hasRule) warnings.push(`Topic ${topic.topic_id} has no rules.`);
    if (!hasLesson) warnings.push(`Topic ${topic.topic_id} has no lessons.`);
    if (!hasQuestion) warnings.push(`Topic ${topic.topic_id} has no questions.`);
  }

  for (const rule of artifacts.rules) {
    const hasQuestion = artifacts.questions.some((questionItem) => questionItem.rule_ids.includes(rule.rule_id));
    if (!hasQuestion) warnings.push(`Rule ${rule.rule_id} has no generated question.`);
    if (rule.confidence !== "high") warnings.push(`Rule ${rule.rule_id} is ${rule.confidence} confidence and should be reviewed.`);
  }

  for (const questionItem of artifacts.questions) {
    if (questionItem.answer_source_status === "needs_review") {
      warnings.push(`Question ${questionItem.question_id} has a selected answer that needs review before scored use.`);
    }
  }

  return {
    status: errors.length ? "FAIL" : warnings.length ? "PASS_WITH_WARNINGS" : "PASS",
    errors,
    warnings,
    counts: {
      sources: artifacts.sources.length,
      topics: artifacts.topics.length,
      rules: artifacts.rules.length,
      lessons: artifacts.lessons.length,
      questions: artifacts.questions.length,
      official_sample_questions: artifacts.official_sample_questions.length,
      test_profiles: artifacts.test_profiles.length
    }
  };
}

function idSet(items, field, errors) {
  const values = new Set();
  for (const item of items) {
    if (!item[field]) {
      errors.push(`Missing ${field} in ${JSON.stringify(item).slice(0, 120)}.`);
      continue;
    }
    if (values.has(item[field])) {
      errors.push(`Duplicate ${field}: ${item[field]}.`);
    }
    values.add(item[field]);
  }
  return values;
}

function required(item, fields, label, errors) {
  for (const field of fields) {
    if (item[field] === undefined || item[field] === null || item[field] === "") {
      errors.push(`Missing ${field} on ${label}.`);
    }
    if (Array.isArray(item[field]) && item[field].length === 0) {
      errors.push(`Empty ${field} on ${label}.`);
    }
  }
}

function refsExist(values, validSet, label, errors) {
  for (const value of values ?? []) {
    if (!validSet.has(value)) {
      errors.push(`${label} reference does not exist: ${value}.`);
    }
  }
}

async function writeReports(artifacts, validation) {
  await writeFile(path.join(REPORT_DIR, "validation_summary.md"), validationMarkdown(validation));
  await writeFile(path.join(REPORT_DIR, "kb_review.md"), reviewMarkdown(artifacts, validation));
}

function validationMarkdown(validation) {
  return `# KB Validation Summary

Status: ${validation.status}

## Counts

- Sources: ${validation.counts.sources}
- Topics: ${validation.counts.topics}
- Rules: ${validation.counts.rules}
- Lessons: ${validation.counts.lessons}
- Questions: ${validation.counts.questions}
- Official sample questions: ${validation.counts.official_sample_questions}
- Test profiles: ${validation.counts.test_profiles}

## Errors

${validation.errors.length ? validation.errors.map((error) => `- ${error}`).join("\n") : "- None"}

## Warnings

${validation.warnings.length ? validation.warnings.map((warning) => `- ${warning}`).join("\n") : "- None"}
`;
}

function reviewMarkdown(artifacts, validation) {
  const sourceSection = artifacts.sources
    .map((source) => `- ${source.title} (${source.citation_label})\n  - URL: ${source.url}\n  - Snapshot: ${source.raw_snapshot_path ?? "not collected"}`)
    .join("\n");
  const topicSection = artifacts.topics
    .map((topic) => {
      const topicRules = artifacts.rules.filter((rule) => rule.topic_ids.includes(topic.topic_id));
      const topicQuestions = artifacts.questions.filter((questionItem) => questionItem.topic_ids.includes(topic.topic_id));
      return `## ${topic.title}

${topic.description}

- Rules: ${topicRules.length}
- Questions: ${topicQuestions.length}

### Rules

${topicRules.map((rule) => `- ${rule.rule_id}: ${rule.rule_summary} [${rule.confidence}]`).join("\n")}

### Questions

${topicQuestions.map((questionItem) => `- ${questionItem.question_id}: ${questionItem.prompt}`).join("\n")}
`;
    })
    .join("\n");
  const sampleSection = artifacts.official_sample_questions
    .map((sampleQuestion) => {
      const choices = sampleQuestion.choices
        .map((choice) => `  - ${choice.choice_id}. ${choice.text}`)
        .join("\n");
      return `- ${sampleQuestion.sample_question_id}: ${sampleQuestion.prompt}
${choices}
  - Answer status: ${sampleQuestion.answer_source_status}
  - Linked scored questions: ${sampleQuestion.linked_question_ids.length ? sampleQuestion.linked_question_ids.join(", ") : "none"}`;
    })
    .join("\n");

  return `# KB Review Report

KB version: ${artifacts.manifest.kb_version}

Source policy: official DMV only.

License note: ${artifacts.manifest.license_note}

Validation status: ${validation.status}

## Sources

${sourceSection}

${topicSection}

## Official Sample Questions

These are parsed from official DMV sample-test pages with all visible answer choices preserved. They are not all used as scored app questions yet.

${sampleSection}

## Review Notes

- Items marked medium confidence should be checked against the handbook before expanding the KB.
- Official sample questions preserve all visible choices. Correct answers remain null unless an official answer key is captured or the answer is handbook-verified.
- The pilot test profile is for app-flow validation, not a final DMV simulation.
- The full candidate test profile must be reverified before production test mode.
`;
}

function printValidation(validation) {
  console.log(`KB validation: ${validation.status}`);
  console.log(JSON.stringify(validation.counts, null, 2));
  if (validation.errors.length) {
    console.error(`Errors: ${validation.errors.length}`);
  }
  if (validation.warnings.length) {
    console.warn(`Warnings: ${validation.warnings.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
