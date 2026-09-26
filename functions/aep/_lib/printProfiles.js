export const UM_PER_INCH = 25400;
export const POINTS_PER_INCH = 72;
export const BASIS_POINTS = 10000;
export const DEFAULT_PRINT_ORDER = "top-to-bottom-right-to-left";
export const PRINT_ORDERS = new Set([
  DEFAULT_PRINT_ORDER,
  "top-to-bottom-left-to-right",
  "left-to-right-top-to-bottom",
  "right-to-left-top-to-bottom"
]);
export const PRINT_PROFILE_LIMITS = {
  minPageUm: 100000,
  maxPageUm: 500000,
  minLabelUm: 5000,
  maxLabelUm: 150000,
  maxMarginUm: 100000,
  maxGapUm: 50000,
  maxOffsetUm: 25000,
  minScaleBp: 8000,
  maxScaleBp: 12000,
  boundsToleranceUm: 2000
};

export const MACO_ML_5000_PROFILE = {
  id: 1,
  name: "MACO ML-5000 - 50 etiquetas",
  pageWidthUm: 215900,
  pageHeightUm: 279400,
  labelWidthUm: 38100,
  labelHeightUm: 25400,
  columns: 5,
  rows: 10,
  marginTopUm: 12700,
  marginRightUm: 12700,
  marginBottomUm: 12700,
  marginLeftUm: 12700,
  gapXUm: 0,
  gapYUm: 0,
  offsetXUm: 0,
  offsetYUm: 0,
  scaleXBp: BASIS_POINTS,
  scaleYBp: BASIS_POINTS,
  active: true,
  isDefault: true
};

export function umToPt(um) {
  return Number(um) * POINTS_PER_INCH / UM_PER_INCH;
}

export function profileCapacity(profile) {
  return Number(profile.columns) * Number(profile.rows);
}

export function normalizeProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pageWidthUm: row.page_width_um,
    pageHeightUm: row.page_height_um,
    labelWidthUm: row.label_width_um,
    labelHeightUm: row.label_height_um,
    columns: row.columns,
    rows: row.rows,
    marginTopUm: row.margin_top_um,
    marginRightUm: row.margin_right_um,
    marginBottomUm: row.margin_bottom_um,
    marginLeftUm: row.margin_left_um,
    gapXUm: row.gap_x_um,
    gapYUm: row.gap_y_um,
    offsetXUm: row.offset_x_um,
    offsetYUm: row.offset_y_um,
    scaleXBp: row.scale_x_bp,
    scaleYBp: row.scale_y_bp,
    active: row.active === 1,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function profileToDbParams(profile) {
  return [
    profile.name,
    profile.pageWidthUm,
    profile.pageHeightUm,
    profile.labelWidthUm,
    profile.labelHeightUm,
    profile.columns,
    profile.rows,
    profile.marginTopUm,
    profile.marginRightUm,
    profile.marginBottomUm,
    profile.marginLeftUm,
    profile.gapXUm,
    profile.gapYUm,
    profile.offsetXUm,
    profile.offsetYUm,
    profile.scaleXBp,
    profile.scaleYBp,
    profile.active ? 1 : 0,
    profile.isDefault ? 1 : 0
  ];
}

export function validateProfileInput(input = {}) {
  const profile = {
    name: String(input.name ?? "").trim(),
    pageWidthUm: Number.parseInt(input.pageWidthUm ?? input.page_width_um, 10),
    pageHeightUm: Number.parseInt(input.pageHeightUm ?? input.page_height_um, 10),
    labelWidthUm: Number.parseInt(input.labelWidthUm ?? input.label_width_um, 10),
    labelHeightUm: Number.parseInt(input.labelHeightUm ?? input.label_height_um, 10),
    columns: Number.parseInt(input.columns, 10),
    rows: Number.parseInt(input.rows, 10),
    marginTopUm: Number.parseInt(input.marginTopUm ?? input.margin_top_um ?? 0, 10),
    marginRightUm: Number.parseInt(input.marginRightUm ?? input.margin_right_um ?? 0, 10),
    marginBottomUm: Number.parseInt(input.marginBottomUm ?? input.margin_bottom_um ?? 0, 10),
    marginLeftUm: Number.parseInt(input.marginLeftUm ?? input.margin_left_um ?? 0, 10),
    gapXUm: Number.parseInt(input.gapXUm ?? input.gap_x_um ?? 0, 10),
    gapYUm: Number.parseInt(input.gapYUm ?? input.gap_y_um ?? 0, 10),
    offsetXUm: Number.parseInt(input.offsetXUm ?? input.offset_x_um ?? 0, 10),
    offsetYUm: Number.parseInt(input.offsetYUm ?? input.offset_y_um ?? 0, 10),
    scaleXBp: Number.parseInt(input.scaleXBp ?? input.scale_x_bp ?? BASIS_POINTS, 10),
    scaleYBp: Number.parseInt(input.scaleYBp ?? input.scale_y_bp ?? BASIS_POINTS, 10),
    active: input.active !== false && input.active !== 0,
    isDefault: input.isDefault === true || input.is_default === 1
  };

  if (!profile.name || profile.name.length > 120) return { ok: false, code: "INVALID_PROFILE_NAME" };
  for (const key of ["pageWidthUm", "pageHeightUm", "labelWidthUm", "labelHeightUm", "columns", "rows"]) {
    if (!Number.isInteger(profile[key]) || profile[key] <= 0) return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  if (
    profile.pageWidthUm < PRINT_PROFILE_LIMITS.minPageUm ||
    profile.pageWidthUm > PRINT_PROFILE_LIMITS.maxPageUm ||
    profile.pageHeightUm < PRINT_PROFILE_LIMITS.minPageUm ||
    profile.pageHeightUm > PRINT_PROFILE_LIMITS.maxPageUm
  ) {
    return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  if (
    profile.labelWidthUm < PRINT_PROFILE_LIMITS.minLabelUm ||
    profile.labelWidthUm > PRINT_PROFILE_LIMITS.maxLabelUm ||
    profile.labelHeightUm < PRINT_PROFILE_LIMITS.minLabelUm ||
    profile.labelHeightUm > PRINT_PROFILE_LIMITS.maxLabelUm
  ) {
    return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  for (const key of ["marginTopUm", "marginRightUm", "marginBottomUm", "marginLeftUm", "gapXUm", "gapYUm"]) {
    if (!Number.isInteger(profile[key]) || profile[key] < 0) return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  for (const key of ["marginTopUm", "marginRightUm", "marginBottomUm", "marginLeftUm"]) {
    if (profile[key] > PRINT_PROFILE_LIMITS.maxMarginUm) return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  for (const key of ["gapXUm", "gapYUm"]) {
    if (profile[key] > PRINT_PROFILE_LIMITS.maxGapUm) return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  for (const key of ["offsetXUm", "offsetYUm"]) {
    if (!Number.isInteger(profile[key]) || Math.abs(profile[key]) > PRINT_PROFILE_LIMITS.maxOffsetUm) {
      return { ok: false, code: "INVALID_PROFILE_OFFSET" };
    }
  }
  if (profile.columns > 20 || profile.rows > 40 || profileCapacity(profile) > 500) {
    return { ok: false, code: "INVALID_PROFILE_CAPACITY" };
  }
  if (
    profile.scaleXBp < PRINT_PROFILE_LIMITS.minScaleBp ||
    profile.scaleXBp > PRINT_PROFILE_LIMITS.maxScaleBp ||
    profile.scaleYBp < PRINT_PROFILE_LIMITS.minScaleBp ||
    profile.scaleYBp > PRINT_PROFILE_LIMITS.maxScaleBp
  ) {
    return { ok: false, code: "INVALID_PROFILE_SCALE" };
  }
  if (!gridFitsPage(profile)) return { ok: false, code: "PROFILE_OUT_OF_BOUNDS" };

  return { ok: true, profile };
}

export function gridFitsPage(profile) {
  const scaleX = Number(profile.scaleXBp) / BASIS_POINTS;
  const scaleY = Number(profile.scaleYBp) / BASIS_POINTS;
  const maxRight = Number(profile.marginLeftUm) + Number(profile.offsetXUm) +
    (Number(profile.columns) - 1) * (Number(profile.labelWidthUm) + Number(profile.gapXUm)) * scaleX +
    Number(profile.labelWidthUm) * scaleX;
  const maxBottom = Number(profile.marginTopUm) + Number(profile.offsetYUm) +
    (Number(profile.rows) - 1) * (Number(profile.labelHeightUm) + Number(profile.gapYUm)) * scaleY +
    Number(profile.labelHeightUm) * scaleY;
  const minLeft = Number(profile.marginLeftUm) + Number(profile.offsetXUm);
  const minTop = Number(profile.marginTopUm) + Number(profile.offsetYUm);
  const tolerance = PRINT_PROFILE_LIMITS.boundsToleranceUm;

  return minLeft >= -tolerance &&
    minTop >= -tolerance &&
    maxRight <= Number(profile.pageWidthUm) + tolerance &&
    maxBottom <= Number(profile.pageHeightUm) + tolerance;
}

export function getSlotPosition(profile, slotNumber) {
  const capacity = profileCapacity(profile);
  const slot = Number.parseInt(slotNumber, 10);
  if (!Number.isInteger(slot) || slot < 1 || slot > capacity) {
    throw new RangeError(`Slot must be between 1 and ${capacity}.`);
  }

  const index = slot - 1;
  const col = index % Number(profile.columns);
  const row = Math.floor(index / Number(profile.columns));
  const scaleX = Number(profile.scaleXBp) / BASIS_POINTS;
  const scaleY = Number(profile.scaleYBp) / BASIS_POINTS;
  const widthUm = Number(profile.labelWidthUm) * scaleX;
  const heightUm = Number(profile.labelHeightUm) * scaleY;
  const xUm = Number(profile.marginLeftUm) + Number(profile.offsetXUm) +
    col * (Number(profile.labelWidthUm) + Number(profile.gapXUm)) * scaleX;
  const yTopUm = Number(profile.marginTopUm) + Number(profile.offsetYUm) +
    row * (Number(profile.labelHeightUm) + Number(profile.gapYUm)) * scaleY;

  return {
    slot,
    row: row + 1,
    column: col + 1,
    x: umToPt(xUm),
    y: umToPt(Number(profile.pageHeightUm) - yTopUm - heightUm),
    width: umToPt(widthUm),
    height: umToPt(heightUm)
  };
}

export function getOrderedPhysicalSlots(profile, printOrder = DEFAULT_PRINT_ORDER) {
  const order = PRINT_ORDERS.has(printOrder) ? printOrder : DEFAULT_PRINT_ORDER;
  const columns = Number(profile.columns);
  const rows = Number(profile.rows);
  const slots = [];

  const pushSlot = (rowIndex, colIndex) => {
    const slot = rowIndex * columns + colIndex + 1;
    slots.push({ ...getSlotPosition(profile, slot), slot });
  };

  if (order === "top-to-bottom-right-to-left") {
    for (let col = columns - 1; col >= 0; col -= 1) {
      for (let row = 0; row < rows; row += 1) pushSlot(row, col);
    }
  } else if (order === "top-to-bottom-left-to-right") {
    for (let col = 0; col < columns; col += 1) {
      for (let row = 0; row < rows; row += 1) pushSlot(row, col);
    }
  } else if (order === "right-to-left-top-to-bottom") {
    for (let row = 0; row < rows; row += 1) {
      for (let col = columns - 1; col >= 0; col -= 1) pushSlot(row, col);
    }
  } else {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) pushSlot(row, col);
    }
  }

  return slots;
}

export function paginateLabels(labels, profile, startSlot = 1, printOrder = DEFAULT_PRINT_ORDER) {
  const capacity = profileCapacity(profile);
  const firstSlot = Number.parseInt(startSlot, 10);
  if (!Number.isInteger(firstSlot) || firstSlot < 1 || firstSlot > capacity) {
    return { ok: false, code: "INVALID_START_SLOT" };
  }

  const orderedSlots = getOrderedPhysicalSlots(profile, printOrder);
  const pages = [];
  let cursor = 0;
  let orderedIndex = firstSlot - 1;

  while (cursor < labels.length) {
    const page = [];
    while (orderedIndex < capacity && cursor < labels.length) {
      page.push({ slot: orderedSlots[orderedIndex].slot, box: orderedSlots[orderedIndex], label: labels[cursor] });
      cursor += 1;
      orderedIndex += 1;
    }
    pages.push(page);
    orderedIndex = 0;
  }

  return { ok: true, pages };
}

export async function listPrintProfiles(db) {
  const rows = await db
    .prepare("SELECT * FROM print_profiles WHERE active = 1 ORDER BY is_default DESC, name ASC")
    .all();
  return (rows?.results ?? []).map(normalizeProfileRow);
}

export async function getPrintProfile(db, profileId = null) {
  if (profileId !== null && profileId !== undefined && String(profileId).trim() !== "") {
    return getPrintProfileById(db, profileId);
  }
  const row = await db.prepare("SELECT * FROM print_profiles WHERE active = 1 ORDER BY is_default DESC, id ASC LIMIT 1").first();
  return normalizeProfileRow(row) ?? MACO_ML_5000_PROFILE;
}

export async function getPrintProfileById(db, profileId) {
  const id = Number.parseInt(profileId, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  const row = await db.prepare("SELECT * FROM print_profiles WHERE id = ? AND active = 1 LIMIT 1").bind(id).first();
  return normalizeProfileRow(row);
}

export async function createPrintProfile(db, input) {
  const validated = validateProfileInput(input);
  if (!validated.ok) return validated;
  const profile = validated.profile;

  const insertStmt = db.prepare(
    `INSERT INTO print_profiles (
       name, page_width_um, page_height_um, label_width_um, label_height_um,
       columns, rows, margin_top_um, margin_right_um, margin_bottom_um, margin_left_um,
       gap_x_um, gap_y_um, offset_x_um, offset_y_um, scale_x_bp, scale_y_bp,
       active, is_default
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  ).bind(...profileToDbParams(profile));

  const results = profile.isDefault
    ? await db.batch([
        db.prepare("UPDATE print_profiles SET is_default = 0 WHERE is_default = 1"),
        insertStmt
      ])
    : await db.batch([insertStmt]);
  const result = profile.isDefault ? results[1]?.results?.[0] : results[0]?.results?.[0];

  return { ok: true, profile: normalizeProfileRow(result) };
}

export async function updatePrintProfile(db, profileId, input) {
  const id = Number.parseInt(profileId, 10);
  if (!Number.isInteger(id) || id < 1) return { ok: false, code: "INVALID_PROFILE_ID" };

  const existing = await getPrintProfileById(db, id);
  if (!existing || existing.id !== id) return { ok: false, code: "PROFILE_NOT_FOUND" };

  const merged = { ...existing, ...input };
  const validated = validateProfileInput(merged);
  if (!validated.ok) return validated;
  const profile = validated.profile;

  if (!profile.active && existing.isDefault) {
    return { ok: false, code: "DEFAULT_PROFILE_REQUIRED" };
  }

  const updateStmt = db.prepare(
    `UPDATE print_profiles
     SET name = ?,
         page_width_um = ?,
         page_height_um = ?,
         label_width_um = ?,
         label_height_um = ?,
         columns = ?,
         rows = ?,
         margin_top_um = ?,
         margin_right_um = ?,
         margin_bottom_um = ?,
         margin_left_um = ?,
         gap_x_um = ?,
         gap_y_um = ?,
         offset_x_um = ?,
         offset_y_um = ?,
         scale_x_bp = ?,
         scale_y_bp = ?,
         active = ?,
         is_default = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING *`
  ).bind(...profileToDbParams(profile), id);

  const results = profile.isDefault
    ? await db.batch([
        db.prepare("UPDATE print_profiles SET is_default = 0 WHERE is_default = 1 AND id <> ?").bind(id),
        updateStmt
      ])
    : await db.batch([updateStmt]);
  const result = profile.isDefault ? results[1]?.results?.[0] : results[0]?.results?.[0];

  return { ok: true, profile: normalizeProfileRow(result) };
}
