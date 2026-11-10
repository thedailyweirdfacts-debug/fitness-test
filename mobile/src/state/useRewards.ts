import { useMemo } from "react";
import { evaluateRewards, toRewardView, type RewardView } from "../../../shared/src";
import { useApp } from "./AppContext";

export function rewardStampFromApp(input: {
  meals: { id: string; loggedAt: string; mealType: string; logKind?: string; items: { baseCalories: number }[] }[];
  recipes: { id: string }[];
  calorieGoal: number | null;
  proteinGoal: number | null;
  goalWindowPercent: number;
}): string {
  return [
    input.meals
      .map((meal) => `${meal.id}:${meal.loggedAt}:${meal.mealType}:${meal.logKind ?? ""}:${meal.items.map((item) => item.baseCalories).join(",")}`)
      .join("|"),
    input.recipes.map((recipe) => recipe.id).join("|"),
    input.calorieGoal ?? "",
    input.proteinGoal ?? "",
    input.goalWindowPercent,
  ].join("~");
}

export function useRewardsModel(): { rewards: RewardView; remote: boolean } {
  const { meals, recipes, settings, remoteRewards } = useApp();
  const local = useMemo(
    () =>
      toRewardView(
        evaluateRewards({
          meals,
          recipes,
          targets: {
            calorieGoal: settings.calorieGoal,
            proteinGoal: settings.proteinGoal,
            windowPercent: settings.goalWindowPercent,
          },
        }),
      ),
    [meals, recipes, settings],
  );
  const stamp = rewardStampFromApp({
    meals,
    recipes,
    calorieGoal: settings.calorieGoal,
    proteinGoal: settings.proteinGoal,
    goalWindowPercent: settings.goalWindowPercent,
  });
  if (remoteRewards && remoteRewards.stamp === stamp) {
    return { rewards: remoteRewards.rewards, remote: true };
  }
  return { rewards: local, remote: false };
}
