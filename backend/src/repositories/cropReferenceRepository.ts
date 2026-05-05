import { db } from "../db/pool";
import {
  CropReferenceRecord,
  mapCropReferenceRecord,
} from "../types/underwriting";

export class CropReferenceRepository {
  async listActive() {
    const result = await db.query<CropReferenceRecord>(
      `SELECT *
       FROM crop_reference
       WHERE active = TRUE
       ORDER BY display_name ASC`
    );

    return result.rows.map(mapCropReferenceRecord);
  }

  async getByCropType(cropType: string) {
    const result = await db.query<CropReferenceRecord>(
      `SELECT *
       FROM crop_reference
       WHERE crop_type = $1
       LIMIT 1`,
      [cropType]
    );

    return result.rows[0] ? mapCropReferenceRecord(result.rows[0]) : null;
  }
}
