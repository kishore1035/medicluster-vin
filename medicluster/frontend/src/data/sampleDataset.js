import sampleData from "./sample_patients.json";
import { uploadDataset } from "../api/apiClient";

function jsonToCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows)
    lines.push(headers.map((h) => row[h] ?? "").join(","));
  return lines.join("\n");
}

/**
 * Upload the bundled sample patients. If the backend can't store it, fall back to an
 * in-memory dataset that clustering accepts inline.
 */
export async function loadSampleDataset() {
  try {
    const csv = jsonToCSV(sampleData);
    const file = new File([csv], "sample_patients.csv", { type: "text/csv" });
    return await uploadDataset(file);
  } catch {
    return {
      datasetId: "__sample__",
      name: "Sample Dataset (100 patients)",
      rowCount: sampleData.length,
      featureNames: Object.keys(sampleData[0]).filter((k) => k !== "patient_id"),
      rawData: sampleData,
    };
  }
}
