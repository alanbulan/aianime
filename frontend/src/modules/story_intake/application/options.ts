export const SPINE_TEMPLATE_OPTIONS: {
  value: "drama" | "narrated";
  labelKey: string;
}[] = [
  { value: "drama", labelKey: "ingest.projectTypes.drama" },
  { value: "narrated", labelKey: "ingest.projectTypes.narrated" },
];

export const VISUAL_STYLE_OPTIONS: { value: string; labelKey: string }[] = [
  {
    value: "chinese_period_drama",
    labelKey: "ingest.visualStyles.chinesePeriodDrama",
  },
  { value: "anime", labelKey: "ingest.visualStyles.anime" },
  {
    value: "guoman_fantasy",
    labelKey: "ingest.visualStyles.guomanFantasy",
  },
  {
    value: "post_apocalyptic",
    labelKey: "ingest.visualStyles.postApocalyptic",
  },
  { value: "realistic", labelKey: "ingest.visualStyles.realistic" },
  {
    value: "republican_era_drama",
    labelKey: "ingest.visualStyles.republicanEraDrama",
  },
];

export const ETHNICITY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "Chinese", labelKey: "ingest.ethnicities.chinese" },
  { value: "Japanese", labelKey: "ingest.ethnicities.japanese" },
  { value: "Korean", labelKey: "ingest.ethnicities.korean" },
  { value: "Western", labelKey: "ingest.ethnicities.western" },
  { value: "Mixed", labelKey: "ingest.ethnicities.mixed" },
];

export const NARRATION_STYLE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "first_person", labelKey: "ingest.firstPerson" },
  { value: "third_person", labelKey: "ingest.thirdPerson" },
];
