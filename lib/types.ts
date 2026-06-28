export type JobSummary = {
  jobTitle: string;
  workDone: string[];
  partsAndMaterials: string[];
  nextSteps: string[];
  customerMessage: string;
};

export type Template = {
  id: string;
  name: string;
  content: string;
};
