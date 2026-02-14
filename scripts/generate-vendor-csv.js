/**
 * Generates vendor_data.csv for Supabase upload.
 * Run: node scripts/generate-vendor-csv.js
 */

import fs from 'fs';

function escapeCsv(str) {
  const s = String(str);
  return '"' + s.replace(/"/g, '""') + '"';
}

const CITIES = [
  { name: 'Atlanta', lat: 33.749, lng: -84.388 },
  { name: 'Austin', lat: 30.2672, lng: -97.7431 },
  { name: 'Denver', lat: 39.7392, lng: -104.9903 },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { name: 'Phoenix', lat: 33.4484, lng: -112.074 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Boston', lat: 42.3601, lng: -71.0589 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Dallas', lat: 32.7767, lng: -96.797 },
  { name: 'Portland', lat: 45.5152, lng: -122.6784 },
  { name: 'Nashville', lat: 36.1627, lng: -86.7816 },
  { name: 'Minneapolis', lat: 44.9778, lng: -93.265 },
  { name: 'San Diego', lat: 32.7157, lng: -117.1611 },
  { name: 'Houston', lat: 29.7604, lng: -95.3698 },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
  { name: 'Detroit', lat: 42.3314, lng: -83.0458 },
  { name: 'Charlotte', lat: 35.2271, lng: -80.8431 },
];

const WEEKLY_FULL = JSON.stringify({
  monday: ['06:00', '20:00'],
  tuesday: ['06:00', '20:00'],
  wednesday: ['06:00', '20:00'],
  thursday: ['06:00', '20:00'],
  friday: ['06:00', '20:00'],
  saturday: ['08:00', '18:00'],
  sunday: null,
});

const WEEKLY_WEEKDAYS = JSON.stringify({
  monday: ['07:00', '19:00'],
  tuesday: ['07:00', '19:00'],
  wednesday: ['07:00', '19:00'],
  thursday: ['07:00', '19:00'],
  friday: ['07:00', '19:00'],
  saturday: null,
  sunday: null,
});

const WEEKLY_FLEX = JSON.stringify({
  monday: ['09:00', '21:00'],
  tuesday: ['09:00', '21:00'],
  wednesday: ['09:00', '21:00'],
  thursday: ['09:00', '21:00'],
  friday: ['09:00', '21:00'],
  saturday: ['10:00', '18:00'],
  sunday: ['10:00', '16:00'],
});

const WEEKLY_MORNINGS = JSON.stringify({
  monday: ['06:00', '14:00'],
  tuesday: ['06:00', '14:00'],
  wednesday: ['06:00', '14:00'],
  thursday: ['06:00', '14:00'],
  friday: ['06:00', '14:00'],
  saturday: null,
  sunday: null,
});

const AVAILABILITIES = [WEEKLY_FULL, WEEKLY_WEEKDAYS, WEEKLY_FLEX, WEEKLY_MORNINGS];

function rnd(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function jitter(coord, amt = 0.02) {
  return coord + (Math.random() - 0.5) * amt;
}

// Job categories: each has type name, 2-4 job_types (type, price, duration), and vendor definitions
const CATEGORIES = [
  {
    name: 'Plumbing',
    jobTypes: [
      { type: 'Plumbing Repair', price: 150, duration_minutes: 90 },
      { type: 'Water Heater Install', price: 1200, duration_minutes: 240 },
      { type: 'Drain Cleaning', price: 180, duration_minutes: 60 },
      { type: 'Pipe Leak Fix', price: 220, duration_minutes: 120 },
    ],
    vendors: ['QuickFix Plumbing', 'ProFlow Solutions', 'Bay Area Plumbing Co', 'Reliable Rooter', 'DripStop Plumbing', 'Metro Pipe Pros', 'GreenFlow Plumbing'],
  },
  {
    name: 'Landscaping',
    jobTypes: [
      { type: 'Lawn Mowing', price: 45, duration_minutes: 60 },
      { type: 'Garden Design', price: 800, duration_minutes: 480 },
      { type: 'Tree Trimming', price: 350, duration_minutes: 180 },
      { type: 'Mulching', price: 120, duration_minutes: 90 },
    ],
    vendors: ['GreenThumb Landscaping', 'Lawn & Order', 'Paradise Gardens', 'Sunrise Landscapes', 'EarthWorks Design', 'Turf Masters', 'Garden State Pro'],
  },
  {
    name: 'Roofing',
    jobTypes: [
      { type: 'Roof Inspection', price: 200, duration_minutes: 90 },
      { type: 'Shingle Replacement', price: 4500, duration_minutes: 480 },
      { type: 'Roof Repair', price: 550, duration_minutes: 180 },
      { type: 'Gutter Install', price: 900, duration_minutes: 240 },
    ],
    vendors: ['Peak Roofing Co', 'Summit Shingles', 'SafeHaven Roofing', 'TopNotch Roofers', 'Apex Roof Solutions', 'StormGuard Roofing'],
  },
  {
    name: 'Drywall',
    jobTypes: [
      { type: 'Drywall Install', price: 400, duration_minutes: 240 },
      { type: 'Drywall Repair', price: 180, duration_minutes: 120 },
      { type: 'Taping & Mudding', price: 350, duration_minutes: 300 },
      { type: 'Texture Match', price: 150, duration_minutes: 90 },
    ],
    vendors: ['SmoothWall Pros', 'Drywall Masters', 'WallCraft Inc', 'Patch & Finish Co', 'BoardRight Drywall', 'Seamless Walls LLC'],
  },
  {
    name: 'Electrician',
    jobTypes: [
      { type: 'Outlet Install', price: 120, duration_minutes: 60 },
      { type: 'Panel Upgrade', price: 2200, duration_minutes: 360 },
      { type: 'Wiring Repair', price: 280, duration_minutes: 120 },
      { type: 'Light Fixture Install', price: 95, duration_minutes: 45 },
    ],
    vendors: ['BrightSpark Electric', 'AmpPro Electrical', 'SafeWire Solutions', 'Current Masters', 'VoltRight Electric', 'CircuitFix Pro', 'PowerFlow Electric'],
  },
  {
    name: 'HVAC',
    jobTypes: [
      { type: 'AC Tune-Up', price: 120, duration_minutes: 90 },
      { type: 'Furnace Repair', price: 250, duration_minutes: 120 },
      { type: 'AC Install', price: 4500, duration_minutes: 480 },
      { type: 'Duct Cleaning', price: 350, duration_minutes: 180 },
    ],
    vendors: ['CoolBreeze HVAC', 'ComfortZone Heating & Cooling', 'FrostGuard AC', 'ClimatePro LLC', 'AirRight HVAC', 'TempMaster Services'],
  },
  {
    name: 'Painting',
    jobTypes: [
      { type: 'Interior Room Paint', price: 350, duration_minutes: 240 },
      { type: 'Exterior House Paint', price: 2500, duration_minutes: 960 },
      { type: 'Cabinet Refinish', price: 800, duration_minutes: 360 },
      { type: 'Touch-Up & Patch', price: 100, duration_minutes: 60 },
    ],
    vendors: ['FreshCoat Painters', 'ColorSplash Pro', 'BrushWorks Painting', 'Premier Paint Co', 'Palette Perfect', 'HousePaint Express', 'Canvas Painting LLC'],
  },
  {
    name: 'Carpentry',
    jobTypes: [
      { type: 'Custom Shelving', price: 450, duration_minutes: 240 },
      { type: 'Deck Build', price: 3500, duration_minutes: 960 },
      { type: 'Door Install', price: 250, duration_minutes: 120 },
      { type: 'Trim Work', price: 180, duration_minutes: 90 },
    ],
    vendors: ['Sawdust & Sons', 'Precision Woodworks', 'TimberCraft LLC', 'FrameRight Carpentry', 'WoodWorks Pro', 'Custom Cut Carpentry'],
  },
  {
    name: 'Masonry',
    jobTypes: [
      { type: 'Brick Repair', price: 400, duration_minutes: 180 },
      { type: 'Patio Install', price: 2800, duration_minutes: 720 },
      { type: 'Chimney Repair', price: 650, duration_minutes: 240 },
      { type: 'Concrete Pour', price: 800, duration_minutes: 360 },
    ],
    vendors: ['SolidStone Masonry', 'Brick & Mortar Co', 'StoneCraft Pros', 'Foundation First', 'MasonWorks LLC', 'Concrete Masters'],
  },
  {
    name: 'Flooring',
    jobTypes: [
      { type: 'Hardwood Install', price: 1200, duration_minutes: 480 },
      { type: 'Tile Install', price: 900, duration_minutes: 360 },
      { type: 'Carpet Install', price: 500, duration_minutes: 240 },
      { type: 'Floor Refinish', price: 600, duration_minutes: 300 },
    ],
    vendors: ['FloorPlan Pros', 'Underfoot Flooring', 'Tile & Wood Co', 'SmoothFloor LLC', 'Premier Floors', 'Refinish Masters', 'Hardwood Haven'],
  },
  {
    name: 'Photography',
    jobTypes: [
      { type: 'Portrait Session', price: 250, duration_minutes: 90 },
      { type: 'Event Photography', price: 800, duration_minutes: 360 },
      { type: 'Product Photography', price: 350, duration_minutes: 120 },
      { type: 'Real Estate Photos', price: 200, duration_minutes: 60 },
    ],
    vendors: ['Lens & Light Studio', 'Capture Co', 'Frame by Frame', 'ShutterBurst Photography', 'Moment Photography', 'PixelPerfect Pro', 'Candid Lens Co'],
  },
  {
    name: 'Videography',
    jobTypes: [
      { type: 'Short Form Video', price: 500, duration_minutes: 240 },
      { type: 'Wedding Video', price: 2200, duration_minutes: 720 },
      { type: 'Commercial Shoot', price: 1200, duration_minutes: 360 },
      { type: 'Drone Footage', price: 400, duration_minutes: 120 },
    ],
    vendors: ['ReelCraft Video', 'Motion Picture Co', 'ClipStudio Pro', 'FrameRate Films', 'VideoVerse LLC', 'ActionCut Productions'],
  },
  {
    name: 'Modeling',
    jobTypes: [
      { type: 'Portfolio Shoot', price: 300, duration_minutes: 120 },
      { type: 'Fashion Show', price: 800, duration_minutes: 240 },
      { type: 'Commercial Modeling', price: 600, duration_minutes: 180 },
      { type: 'Product Modeling', price: 400, duration_minutes: 120 },
    ],
    vendors: ['Face Forward Agency', 'Runway Ready Models', 'Portfolio Pro', 'StyleHouse Talent', 'Image Models Co', 'Spotlight Talent'],
  },
  {
    name: 'Art Commissions',
    jobTypes: [
      { type: 'Portrait Commission', price: 350, duration_minutes: 600 },
      { type: 'Mural', price: 1500, duration_minutes: 1440 },
      { type: 'Custom Illustration', price: 200, duration_minutes: 240 },
      { type: 'Digital Art', price: 150, duration_minutes: 180 },
    ],
    vendors: ['Canvas & Ink', 'Brushstroke Studio', 'Custom Art Co', 'Mural Masters', 'Sketch & Paint', 'Artisan Commissions', 'Painted Dreams'],
  },
  {
    name: 'Graphic Design',
    jobTypes: [
      { type: 'Logo Design', price: 400, duration_minutes: 480 },
      { type: 'Brand Kit', price: 800, duration_minutes: 720 },
      { type: 'Social Media Pack', price: 250, duration_minutes: 180 },
      { type: 'Flyer Design', price: 120, duration_minutes: 90 },
    ],
    vendors: ['Pixel Perfect Design', 'Type & Color Studio', 'BrandCraft Co', 'Visual Voice', 'DesignLab Pro', 'Creative Grid LLC', 'Ink & Vector'],
  },
  {
    name: 'Tutoring',
    jobTypes: [
      { type: 'Math Tutoring', price: 60, duration_minutes: 60 },
      { type: 'Test Prep', price: 90, duration_minutes: 90 },
      { type: 'Language Tutoring', price: 55, duration_minutes: 60 },
      { type: 'Music Lesson', price: 70, duration_minutes: 60 },
    ],
    vendors: ['BrightMind Tutoring', 'StudyBuddy Pro', 'LearnRight Academy', 'TutorTime LLC', 'Subject Masters', 'EduConnect Tutors', 'SkillBuild Learning'],
  },
];

let vendorId = 1;
const rows = [];
const header = 'vendor_id,name,weekly_availability,max_distance_miles,home_location,experience_years,negotiation_aggression,job_types,upcoming_jobs';

for (const cat of CATEGORIES) {
  const jobTypesJson = JSON.stringify(
    cat.jobTypes.map((j) => ({ type: j.type, price: j.price, duration_minutes: j.duration_minutes }))
  );

  for (const vendorName of cat.vendors) {
    const city = rnd(CITIES);
    const homeLocation = JSON.stringify({
      lat: Math.round(jitter(city.lat) * 10000) / 10000,
      lng: Math.round(jitter(city.lng) * 10000) / 10000,
    });
    const weekly = rnd(AVAILABILITIES);
    const maxDist = rndInt(15, 45);
    const expYears = rndInt(2, 22);
    const aggression = rndInt(1, 8);

    const numUpcoming = rndInt(1, 3);
    const upcoming = [];
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let i = 0; i < numUpcoming; i++) {
      const j = rnd(cat.jobTypes);
      const month = rndInt(2, 4);
      const maxDay = daysInMonth[month - 1];
      const day = rndInt(18, maxDay);
      const startH = rndInt(8, 14);
      const dur = j.duration_minutes;
      const endM = startH * 60 + dur;
      const endH = Math.min(23, Math.floor(endM / 60));
      const endMin = endM % 60;
      upcoming.push({
        date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        start_time: `${String(startH).padStart(2, '0')}:00`,
        end_time: `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
        price: j.price,
        type: j.type,
      });
    }
    const upcomingJson = JSON.stringify(upcoming);

    const row = [
      vendorId,
      vendorName,
      weekly,
      maxDist,
      homeLocation,
      expYears,
      aggression,
      jobTypesJson,
      upcomingJson,
    ].map(escapeCsv).join(',');

    rows.push(row);
    vendorId++;
  }
}

const csv = [header, ...rows].join('\n');
const outPath = 'vendor_data.csv';
fs.writeFileSync(outPath, csv, 'utf8');
console.log(`Wrote ${rows.length} vendors to ${outPath}`);
