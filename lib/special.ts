// Special Arrangements: special items stored by MKA.

export const SPECIAL_STATUSES = ["Available", "Unavailable", "Damaged"] as const;
export type SpecialStatus = (typeof SPECIAL_STATUSES)[number];

export type SpecialItem = {
  id: string;
  item_name: string;
  quantity: number;
  location: string | null;
  status: SpecialStatus;
  notes: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  creator: { full_name: string | null } | null;
  editor: { full_name: string | null } | null;
};

/** Offered while typing a location; any other place can be typed in. */
export const SPECIAL_LOCATION_SUGGESTIONS = [
  "Islamabad Muqami Store",
  "SeM Garage",
  "AeM Container 1",
  "AeM Container 2",
  "AeM Container 3",
  "Baitul Futuh Container",
  "Baitul Futuh Khuddam Office",
  "Baitul Futuh Tahir Hall Store Room",
  "Baitul Ehsan Store",
  "HM Storage",
  "Kingsley Storage",
];
