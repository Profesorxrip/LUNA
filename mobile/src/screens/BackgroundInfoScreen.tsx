import React from "react";
import { useTranslation } from "react-i18next";
import InfoScreen from "./InfoScreen";

export default function BackgroundInfoScreen() {
  const { t } = useTranslation();
  const sections = [
    { body: t("backgroundInfo.body1") },
    { heading: t("backgroundInfo.heading2"), body: t("backgroundInfo.body2") },
    { heading: t("backgroundInfo.heading3"), body: t("backgroundInfo.body3") },
  ];
  return <InfoScreen title={t("backgroundInfo.title")} sections={sections} />;
}
