import React from "react";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import StaticTabBar, { TabKey } from "./StaticTabBar";

/** Gercek Tab.Navigator'in altbari - gorsel/dokunma mantigi StaticTabBar.tsx'te
 * (bkz. orada), burada sadece react-navigation'in state/navigation'ini
 * StaticTabBar'in basit activeTab/onSelect arayuzune ceviriyoruz. */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const activeTab = state.routes[state.index].name as TabKey;

  function onSelect(tab: TabKey) {
    const route = state.routes.find((r) => r.name === tab);
    if (!route) return;
    const isFocused = state.index === state.routes.indexOf(route);
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  }

  return <StaticTabBar activeTab={activeTab} onSelect={onSelect} />;
}
