/** Fictional names only — no real retailers, people or imprints. */

export const CHANNELS = [
  { id: "ONLRET", name: "Online Retail", orgs: 4, accounts: [1, 3] as const, weight: 9 },
  { id: "NATCHAIN", name: "National Chains", orgs: 5, accounts: [2, 5] as const, weight: 8 },
  { id: "DISTRADE", name: "Trade Distributors", orgs: 6, accounts: [1, 3] as const, weight: 5 },
  { id: "EDULIB", name: "Education & Library", orgs: 6, accounts: [2, 7] as const, weight: 3 },
  { id: "MASSMER", name: "Mass Merchandise", orgs: 7, accounts: [4, 14] as const, weight: 6 },
  { id: "RETINDEP", name: "Independent Retail", orgs: 14, accounts: [4, 22] as const, weight: 2 },
  { id: "SMIND", name: "Special Markets", orgs: 6, accounts: [1, 5] as const, weight: 2 },
] as const;

export const ORG_FIRST = [
  "Brightleaf", "Cornerstone", "Harbor", "Northwind", "Silver Birch", "Maple Row", "Bluewater", "Old Mill",
  "Lantern", "Redwood", "Starling", "Juniper", "Copperfield", "Stonebridge", "Willow Creek", "Foxglove",
  "Highland", "Riverbend", "Oak & Ivy", "Meridian", "Cobalt", "Kestrel", "Larkspur", "Summit",
  "Tidewater", "Quill", "Evergreen", "Driftwood", "Wren", "Beacon", "Hollow Pine", "Saltmarsh",
];
export const ORG_SUFFIX: Record<string, string[]> = {
  ONLRET: ["Online", "Digital Books", "eMarket", "Direct"],
  NATCHAIN: ["Booksellers", "Books & Co.", "Book Stores", "Reading Rooms"],
  DISTRADE: ["Distribution", "Wholesale", "Book Supply", "Trade Services"],
  EDULIB: ["Library Services", "School Supply", "Educational", "Learning Group"],
  MASSMER: ["Mart", "Superstores", "Retail Group", "Market"],
  RETINDEP: ["Bookshop", "Books", "Book Nook", "Reading Co."],
  SMIND: ["Gifts", "Museum Shops", "Home & Gift", "Specialty"],
};
export const CITIES = [
  "Denver", "Austin", "Portland", "Chicago", "Boston", "Atlanta", "Phoenix", "Seattle", "Nashville", "Raleigh",
  "Madison", "Tucson", "Omaha", "Richmond", "Savannah", "Boise", "Albany", "Tulsa", "Burlington", "Asheville",
  "Santa Fe", "Des Moines", "Lexington", "Providence", "Missoula", "Charleston", "Spokane", "Ann Arbor",
];

export const DIVISIONS = [
  { name: "Adult Trade", imprints: ["Northlight Press", "Harbor & Pine", "Atlas Image", "Canvas House"], formats: ["HC", "HC", "PB"], share: 0.45 },
  { name: "Children's", imprints: ["Little Lantern", "Paper Crane", "Blue Finch Books"], formats: ["HC", "BB", "BB", "PB"], share: 0.35 },
  { name: "Gift & Stationery", imprints: ["Stoneway Gift", "Moth & Moon"], formats: ["HC", "PB"], share: 0.12 },
  { name: "Distribution Clients", imprints: ["Wildflower Editions", "Kite Street"], formats: ["PB", "HC"], share: 0.08 },
] as const;

export const FORMAT_LABEL: Record<string, string[]> = {
  HC: ["Hardcover", "Hardcover w/ Jacket"],
  PB: ["Paperback", "Trade Paperback"],
  BB: ["Board Book"],
};

const TITLE_A = [
  "The Quiet", "A Field Guide to", "Letters from", "The Art of", "Under the", "Midnight", "The Little", "Secrets of",
  "Finding", "The Last", "Kitchen", "Wild", "A Year of", "The Hidden", "Stories from", "Journey to", "The Big Book of",
  "Painted", "Sleepy", "The Curious", "Brave", "Everyday", "The Complete", "Beyond the", "Dreams of",
];
const TITLE_B = [
  "Lighthouse", "Garden", "Mountains", "Tides", "Owls", "Stars", "Bakery", "Cities", "Forest", "Rivers",
  "Dragons", "Kittens", "Machines", "Cartographer", "Harvest", "Winter", "Color", "Architecture", "Birds",
  "Oceans", "Train", "Bears", "Moon", "Studio", "Islands", "Maps", "Recipes", "Seasons", "Museum", "Letters",
];
const FIRST = ["Maya", "Theo", "Iris", "Owen", "Nora", "Felix", "Hazel", "Jonah", "Clara", "Milo", "Ruth", "Ezra", "June", "Silas", "Ada", "Leo", "Vera", "Hugo", "Elsie", "Arlo"];
const LAST = ["Hartwell", "Okafor", "Lindqvist", "Moreau", "Castellano", "Whitaker", "Nakamura", "Brennan", "Delacroix", "Aldridge", "Kowalski", "Fairbanks", "Oyelaran", "Sorensen", "Pemberton", "Valdez", "Ashby", "Quintero", "Holloway", "Strand"];

export const titleName = (pick: <T>(a: readonly T[]) => T) => `${pick(TITLE_A)} ${pick(TITLE_B)}`;
export const personName = (pick: <T>(a: readonly T[]) => T) => `${pick(FIRST)} ${pick(LAST)}`;

export const SALES_NOTES = [
  "Endcap confirmed for launch week",
  "Buyer wants signed stock",
  "Holiday promo candidate",
  "Co-op approved",
  "Reorder expected after first review",
  "Author event scheduled",
  "Front table in top 50 stores",
  "Hold until final pricing",
  "Strong response to galleys",
  "Awaiting buyer feedback",
];

export const TITLE_NOTES = [
  "Major media campaign planned; national TV booked.",
  "Series continuation — previous title sold through quickly.",
  "Price point under review with sales.",
  "Tie-in with museum exhibition opening in spring.",
  "Paper allocation confirmed at meeting.",
  "Consider second printing if pre-orders exceed goal.",
];

export const READERLINK_CHAINS = [
  "Pinecrest Stores", "Valley Fresh Markets", "Gallagher Drug", "Sunburst Supercenters", "Meadowbrook Grocers",
  "Coastline Pharmacy", "Prairie Market", "Hilltop Warehouse Club", "Crescent Foods", "Benton Family Stores",
];
