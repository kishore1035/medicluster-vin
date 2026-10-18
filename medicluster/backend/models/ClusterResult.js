/**
 * backend/models/ClusterResult.js
 * Storage model for clustering run results.
 */

const { defineModel, schema: defineSchema } = require('../db/model');

const ClusterParamsSchema = defineSchema(
  {
    k: Number,
    kmeans_init: String,
    eps: Number,
    min_samples: Number,
    n_clusters: Number,
    linkage: String,
    n_components: Number,
    covariance_type: String,
    risk_feature_weights: { type: Map, of: Number, default: undefined },
  },
  { _id: false }
);

const PatientResultSchema = defineSchema(
  {
    patient_id: String,
    gender: String,
    age: Number,
    bmi: Number,
    systolic_bp: Number,
    diastolic_bp: Number,
    glucose: Number,
    hba1c: Number,
    cholesterol: Number,
    hdl: Number,
    ldl: Number,
    triglycerides: Number,
    heart_rate: Number,
    spo2: Number,
    num_medications: Number,
    cluster_id: Number,
    risk_tier: String,
    pca_x: Number,
    pca_y: Number,
    gmm_probabilities: [{ type: Number }],
    numericFeatures: { type: Map, of: Number, default: {} },
    textFeatures: { type: Map, of: String, default: {} },
  },
  { _id: false }
);

const RiskDistributionSchema = defineSchema(
  {
    Low: { type: Number, default: 0 },
    Moderate: { type: Number, default: 0 },
    High: { type: Number, default: 0 },
    Critical: { type: Number, default: 0 },
    Noise: { type: Number, default: 0 },
    Unknown: { type: Number, default: 0 },
  },
  { _id: false }
);

const ClusterProfileSchema = defineSchema(
  {
    cluster_id: Number,
    risk_tier: String,
    size: Number,
    centroidFeatures: { type: Map, of: Number, default: {} },
  },
  { _id: false }
);

const PreprocessingSchema = defineSchema(
  {
    rows_before: Number,
    rows_after: Number,
    dropped_rows: Number,
    dropped_non_numeric_columns: [{ type: String }],
    feature_names: [{ type: String }],
  },
  { _id: false }
);

const ClusterResultSchema = defineSchema(
  {
    datasetId: {
      type: String,
      ref: "Dataset",
      required: true,
    },
    algorithm: { type: String, required: true },
    params: { type: ClusterParamsSchema, default: {} },
    patients: [PatientResultSchema],
    metrics: {
      silhouette: Number,
      davies_bouldin: Number,
      calinski_harabasz: Number,
    },
    riskDistribution: { type: RiskDistributionSchema, default: {} },
    clusterProfiles: [ClusterProfileSchema],
    featureNames: [{ type: String }],
    linkageMatrix: [[Number]],
    preprocessing: { type: PreprocessingSchema, default: undefined },
    warnings: [{ type: String }],
  },
  { timestamps: true }
);


module.exports = defineModel("ClusterResult", ClusterResultSchema);
