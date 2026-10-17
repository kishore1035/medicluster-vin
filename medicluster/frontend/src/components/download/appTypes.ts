export interface ProductApp {
  id: string;
  name: string;
  description: string;
  webHref: string | null;
  android: boolean;
}

export interface PatientRelease {
  versionName: string;
  sizeBytes: number;
  sha256: string;
}
