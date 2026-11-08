/**
 * Guidance shown on the public Report an issue page and on the Jaidat
 * Documents tab. General guidance only: check gov.uk or hse.gov.uk before
 * relying on any of it.
 */

export const FAQ: { q: string; a: string }[] = [
  { q: "Do I need to log in?", a: "No. Anyone can report a problem. We ask for your name and a way to contact you so we can follow up." },
  { q: "What should I include?", a: "The property and the room if you know them, what you saw, and when you saw it. Photos can be sent by email afterwards, quoting your reference." },
  { q: "Is this the right place for an emergency?", a: "No. If anyone is in danger, call 999. If you smell gas, leave the area and call the National Gas Emergency line on 0800 111 999." },
  { q: "What happens next?", a: "The Jaidad team reviews the report, sets a priority from P1 (emergency) to P4 (planned) and arranges the work. Normal reports are looked at within 5 days." },
  { q: "How do I follow up?", a: "Quote your reference (for example INC-0012) when you email jaidad@khuddam.co.uk." },
  { q: "Who sees my report?", a: "Only the Jaidad team and the people they ask to help with it." },
];

export type Article = { title: string; points: string[]; topic: "Reporting" | "Safety" | "Landlord duties" | "Data" };

export const ARTICLES: Article[] = [
  {
    topic: "Reporting",
    title: "Reporting a maintenance fault",
    points: [
      "Choose the property if you know it. If not, choose \"Not sure\".",
      "Say where in the building the problem is, for example \"ground floor shower room\".",
      "Describe what you saw and when. \"Urgent\" means it needs attention soon; it isn't for emergencies.",
      "Keep the reference number you're given.",
    ],
  },
  {
    topic: "Reporting",
    title: "Mould or damp in showers and rooms",
    points: [
      "Report the room, how big the patch is, and when you first saw it.",
      "Open windows and use extractor fans where they're fitted.",
      "Don't paint over mould or block vents.",
    ],
  },
  {
    topic: "Reporting",
    title: "Gym and equipment faults",
    points: ["If equipment looks damaged, loose or unsafe, don't use it.", "If it's safe to, leave a note saying it's out of order.", "Report which equipment and where it is. Don't try to repair it yourself."],
  },
  {
    topic: "Reporting",
    title: "Lost keys or lock problems",
    points: ["Report it straight away, with where the lock is.", "Never put access codes in a report.", "Jaidad arranges any locksmith visit."],
  },
  {
    topic: "Reporting",
    title: "Pest sightings",
    points: ["Say what you saw, where and when.", "Keep food sealed and rubbish covered.", "Don't put poison down unless Jaidad has asked you to."],
  },
  {
    topic: "Safety",
    title: "Fire, gas and electrical dangers",
    points: [
      "If anyone is in danger, call 999.",
      "Gas smell: leave the area and call 0800 111 999.",
      "Sparking or a burning smell from electrics: switch off at the socket if it's safe, and call 999 if there's fire.",
      "This page isn't for emergencies.",
    ],
  },
  {
    topic: "Landlord duties",
    title: "Gas safety checks",
    points: [
      "Gas appliances, flues and pipework in rented homes need a check by a Gas Safe registered engineer at least every 12 months.",
      "Give the tenant a copy of the record within 28 days and keep it on the property's record.",
      "Gas Safety (Installation and Use) Regulations 1998.",
    ],
  },
  {
    topic: "Landlord duties",
    title: "Electrical safety (EICR)",
    points: [
      "Rented homes in England need an Electrical Installation Condition Report at least every 5 years.",
      "Give the tenant a copy within 28 days.",
      "Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020.",
    ],
  },
  {
    topic: "Landlord duties",
    title: "Smoke and carbon monoxide alarms",
    points: [
      "A working smoke alarm on every storey with living space.",
      "A carbon monoxide alarm in any room with a fixed combustion appliance, such as a boiler.",
      "Test at the start of each tenancy. Smoke and Carbon Monoxide Alarm (England) Regulations 2015, as amended.",
    ],
  },
  {
    topic: "Safety",
    title: "Fire risk assessment",
    points: [
      "Offices, guest houses and the shared parts of residential buildings need a fire risk assessment by the responsible person.",
      "Review it regularly and act on its actions.",
      "Regulatory Reform (Fire Safety) Order 2005.",
    ],
  },
  {
    topic: "Safety",
    title: "Legionella in water systems",
    points: ["Showers and stored hot water in shared buildings need a legionella risk assessment.", "Report stagnant water or little-used outlets.", "HSE approved code of practice L8."],
  },
  {
    topic: "Landlord duties",
    title: "Energy performance certificates",
    points: ["Let homes need a valid EPC, and under the current minimum standard a rating of E or above.", "EPCs last 10 years: keep the expiry on the property's record."],
  },
  {
    topic: "Safety",
    title: "Asbestos",
    points: ["Non-domestic buildings built before 2000 need an asbestos survey and management plan.", "Never disturb suspected asbestos. Report it to the Jaidad officer.", "Control of Asbestos Regulations 2012."],
  },
  {
    topic: "Safety",
    title: "Serious injuries and dangerous incidents (RIDDOR)",
    points: ["Some injuries and dangerous incidents must be reported to the HSE.", "Report any serious injury here and tell the Jaidad officer straight away so they can decide whether a RIDDOR report is needed."],
  },
  {
    topic: "Data",
    title: "Personal details in reports",
    points: [
      "Only give the details needed to deal with your report.",
      "Don't include other people's personal or medical details, or access codes.",
      "Personal data is handled under UK GDPR and the Data Protection Act 2018.",
    ],
  },
];
