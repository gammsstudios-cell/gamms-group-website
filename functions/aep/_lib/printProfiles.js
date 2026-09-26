export const UM_PER_INCH = 25400;
export const POINTS_PER_INCH = 72;
export const BASIS_POINTS = 10000;

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
  for (const key of ["marginTopUm", "marginRightUm", "marginBottomUm", "marginLeftUm", "gapXUm", "gapYUm"]) {
    if (!Number.isInteger(profile[key]) || profile[key] < 0) return { ok: false, code: "INVALID_PROFILE_DIMENSIONS" };
  }
  if (profile.columns > 20 || profile.rows > 40 || profileCapacity(profile) > 500) {
    return { ok: false, code: "INVALID_PROFILE_CAPACITY" };
  }
  if (profile.scaleXBp < 5000 || profile.scaleXBp > 15000 || profile.scaleYBp < 5000 || profile.scaleYBp > 15000) {
    return { ok: false, code: "INVALID_PROFILE_SCALE" };
  }

  return { ok: true, profile };
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
  const rawXUm = Number(profile.marginLeftUm) + col * (Number(profile.labelWidthUm) + Number(profile.gapXUm));
  const rawYTopUm = Number(profile.marginTopUm) + row * (Number(profile.labelHeightUm) + Number(profile.gapYUm));
  const widthUm = Number(profile.labelWidthUm) * Number(profile.scaleXBp) / BASIS_POINTS;
  const heightUm = Number(profile.labelHeightUm) * Number(profile.scaleYBp) / BASIS_POINTS;
  const xUm = rawXUm + Number(profile.offsetXUm);
  const yTopUm = rawYTopUm + Number(profile.offsetYUm);

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

export function paginateLabels(labels, profile, startSlot = 1) {
  const capacity = profileCapacity(profile);
  const firstSlot = Number.parseInt(startSlot, 10);
  if (!Number.isInteger(firstSlot) || firstSlot < 1 || firstSlot > capacity) {
    return { ok: false, code: "INVALID_START_SLOT" };
  }

  const pages = [];
  let cursor = 0;
  let slot = firstSlot;

  while (cursor < labels.length) {
    const page = [];
    while (slot <= capacity && cursor < labels.length) {
      page.push({ slot, label: labels[cursor] });
      cursor += 1;
      slot += 1;
    }
    pages.push(page);
    slot = 1;
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
  const id = Number.parseInt(profileId, 10);
  const row = Number.isInteger(id) && id > 0
    ? await db.prepare("SELECT * FROM print_profiles WHERE id = ? AND active = 1 LIMIT 1").bind(id).first()
    : await db.prepare("SELECT * FROM print_profiles WHERE active = 1 ORDER BY is_default DESC, id ASC LIMIT 1").first();
  return normalizeProfileRow(row) ?? MACO_ML_5000_PROFILE;
}

export async function createPrintProfile(db, input) {
  const validated = validateProfileInput(input);
  if (!validated.ok) return validated;
  const profile = validated.profile;

  if (profile.isDefault) {
    await db.prepare("UPDATE print_profiles SET is_default = 0 WHERE is_default = 1").run();
  }

  const result = await db.prepare(
    `INSERT INTO print_profiles (
       name, page_width_um, page_height_um, label_width_um, label_height_um,
       columns, rows, margin_top_um, margin_right_um, margin_bottom_um, margin_left_um,
       gap_x_um, gap_y_um, offset_x_um, offset_y_um, scale_x_bp, scale_y_bp,
       active, is_default
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  ).bind(...profileToDbParams(profile)).first();

  return { ok: true, profile: normalizeProfileRow(result) };
}

export async function updatePrintProfile(db, profileId, input) {
  const id = Number.parseInt(profileId, 10);
  if (!Number.isInteger(id) || id < 1) return { ok: false, code: "INVALID_PROFILE_ID" };

  const existing = await getPrintProfile(db, id);
  if (!existing || existing.id !== id) return { ok: false, code: "PROFILE_NOT_FOUND" };

  const merged = { ...existing, ...input };
  const validated = validateProfileInput(merged);
  if (!validated.ok) return validated;
  const profile = validated.profile;

  if (profile.isDefault) {
    await db.prepare("UPDATE print_profiles SET is_default = 0 WHERE is_default = 1 AND id <> ?").bind(id).run();
  }

  const result = await db.prepare(
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
  ).bind(...profileToDbParams(profile), id).first();

  return { ok: true, profile: normalizeProfileRow(result) };
}
