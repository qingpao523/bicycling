import type { AssistantChunk } from "./protocol";

export type OnboardingStep =
  | "greeting"
  | "ask_name"
  | "ask_user_type"
  | "ask_icu_key"
  | "ask_primary_device"
  | "ask_weight"
  | "ask_ftp"
  | "ask_hr_zones"
  | "ask_goal"
  | "summary"
  | "completed";

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  collectedData: Record<string, unknown>;
}

export function createInitialOnboardingState(): OnboardingState {
  return {
    currentStep: "greeting",
    completedSteps: [],
    collectedData: {},
  };
}

export function parseOnboardingState(json: string | null | undefined): OnboardingState {
  if (!json) return createInitialOnboardingState();
  try {
    return JSON.parse(json) as OnboardingState;
  } catch {
    return createInitialOnboardingState();
  }
}

function text(content: string): AssistantChunk {
  return { type: "delta", content };
}

function nextStep(state: OnboardingState): OnboardingStep {
  const userType = state.collectedData.userType as string | undefined;

  const flow: OnboardingStep[] = ["greeting", "ask_name", "ask_user_type"];

  if (userType === "power") {
    flow.push("ask_icu_key", "ask_weight", "ask_ftp");
  } else if (userType === "watch") {
    flow.push("ask_primary_device", "ask_weight", "ask_hr_zones");
  } else {
    flow.push("ask_weight");
  }

  flow.push("ask_goal", "summary", "completed");

  const currentIdx = flow.indexOf(state.currentStep);
  if (currentIdx === -1 || currentIdx >= flow.length - 1) return "completed";
  return flow[currentIdx + 1];
}

export function processOnboardingMessage(
  state: OnboardingState,
  userMessage: string,
): { chunks: AssistantChunk[]; newState: OnboardingState } {
  const chunks: AssistantChunk[] = [];
  const newState: OnboardingState = {
    currentStep: state.currentStep,
    completedSteps: [...state.completedSteps],
    collectedData: { ...state.collectedData },
  };

  switch (state.currentStep) {
    case "greeting": {
      chunks.push(text("你好！我是你的骑行训练 AI 助手 🚴\n\n我会帮你设置好系统，之后就可以开始分析你的训练数据了。\n\n先告诉我你的名字？"));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "name",
          label: "你的名字",
          inputType: "text",
          placeholder: "输入你的名字",
          validation: { required: true },
        },
      });
      newState.completedSteps.push("greeting");
      newState.currentStep = "ask_name";
      break;
    }

    case "ask_name": {
      const name = userMessage.trim();
      if (!name) {
        chunks.push(text("名字不能为空，请输入你的名字。"));
        return { chunks, newState };
      }
      newState.collectedData.name = name;
      newState.completedSteps.push("ask_name");
      newState.currentStep = "ask_user_type";

      chunks.push(text(`${name}，欢迎！\n\n你平时用什么方式记录训练数据？这会决定系统为你展示哪些分析模块。`));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "userType",
          label: "训练记录方式",
          inputType: "select",
          options: [
            { value: "power", label: "功率计（骑行台 / 码表）" },
            { value: "watch", label: "智能手表（Garmin / Apple Watch 等）" },
            { value: "basic", label: "暂时不用设备" },
          ],
        },
      });
      break;
    }

    case "ask_user_type": {
      const value = userMessage.trim().toLowerCase();
      const valid = ["power", "watch", "basic"];
      if (!valid.includes(value)) {
        chunks.push(text("请从选项中选择一个。"));
        return { chunks, newState };
      }
      newState.collectedData.userType = value;
      newState.completedSteps.push("ask_user_type");
      chunks.push({ type: "action", action: { kind: "set_user_field", field: "userType", value } });

      if (value === "power") {
        newState.currentStep = "ask_icu_key";
        chunks.push(text("使用功率计训练，系统可以为你做功率曲线、TSS 负荷、FTP 趋势等深度分析。\n\n要自动同步训练数据，需要你的 **intervals.icu API Key**。\n\n获取方式：登录 intervals.icu → Settings → Developer → API Key\n\n你也可以暂时跳过，稍后在设置里配置。"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "intervalsApiKey",
            label: "intervals.icu API Key",
            inputType: "password",
            placeholder: "粘贴你的 API Key",
            skippable: true,
          },
        });
      } else if (value === "watch") {
        newState.currentStep = "ask_primary_device";
        chunks.push(text("智能手表用户，系统会侧重心率分析、HRV 趋势、恢复评估和睡眠质量。\n\n你的主力设备是？"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "primaryDevice",
            label: "主力设备",
            inputType: "select",
            options: [
              { value: "garmin", label: "Garmin" },
              { value: "apple_watch", label: "Apple Watch" },
              { value: "whoop", label: "WHOOP" },
              { value: "coros", label: "COROS" },
              { value: "other", label: "其他" },
            ],
          },
        });
      } else {
        newState.currentStep = "ask_weight";
        chunks.push(text("没问题！系统也可以基于心率和基本运动数据为你提供训练建议。\n\n告诉我你的体重（kg），这会用于计算功率体重比和消耗量。"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "weightKg",
            label: "体重（kg）",
            inputType: "number",
            placeholder: "例如 72",
            validation: { min: 35, max: 150 },
            skippable: true,
          },
        });
      }
      break;
    }

    case "ask_icu_key": {
      const key = userMessage.trim();
      if (key && key !== "skip" && key !== "跳过") {
        newState.collectedData.intervalsApiKey = key;
        chunks.push({ type: "action", action: { kind: "set_user_field", field: "intervalsApiKey", value: key } });
      }
      newState.completedSteps.push("ask_icu_key");
      newState.currentStep = "ask_weight";

      chunks.push(text(key && key !== "skip" && key !== "跳过" ? "API Key 已保存。\n\n" : "好的，跳过了。你可以稍后在设置里配置。\n\n"));
      chunks.push(text("告诉我你的体重（kg），这对功率体重比计算很重要。"));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "weightKg",
          label: "体重（kg）",
          inputType: "number",
          placeholder: "例如 72",
          validation: { min: 35, max: 150 },
          skippable: true,
        },
      });
      break;
    }

    case "ask_primary_device": {
      const device = userMessage.trim().toLowerCase();
      newState.collectedData.primaryDevice = device;
      newState.completedSteps.push("ask_primary_device");
      newState.currentStep = "ask_weight";
      chunks.push({ type: "action", action: { kind: "set_user_field", field: "primaryDevice", value: device } });

      chunks.push(text("收到。\n\n告诉我你的体重（kg），这对计算运动消耗和恢复建议很重要。"));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "weightKg",
          label: "体重（kg）",
          inputType: "number",
          placeholder: "例如 72",
          validation: { min: 35, max: 150 },
          skippable: true,
        },
      });
      break;
    }

    case "ask_weight": {
      const w = userMessage.trim();
      if (w && w !== "skip" && w !== "跳过") {
        const num = parseFloat(w);
        if (!isNaN(num) && num >= 35 && num <= 150) {
          newState.collectedData.weightKg = num;
          chunks.push({ type: "action", action: { kind: "set_user_field", field: "weightKg", value: num } });
        }
      }
      newState.completedSteps.push("ask_weight");

      const userType = newState.collectedData.userType;
      if (userType === "power") {
        newState.currentStep = "ask_ftp";
        chunks.push(text("你当前的 FTP 是多少？如果不确定可以跳过，系统会在同步数据后自动估算。"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "ftp",
            label: "FTP（瓦）",
            inputType: "number",
            placeholder: "例如 250",
            validation: { min: 80, max: 500 },
            skippable: true,
          },
        });
      } else if (userType === "watch") {
        newState.currentStep = "ask_hr_zones";
        chunks.push(text("你知道自己的最大心率吗？如果不确定可以跳过，系统会根据年龄估算。"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "maxHr",
            label: "最大心率（bpm）",
            inputType: "number",
            placeholder: "例如 190",
            validation: { min: 120, max: 230 },
            skippable: true,
          },
        });
      } else {
        newState.currentStep = "ask_goal";
        chunks.push(text("最后一个问题：你骑车的主要目标是什么？"));
        chunks.push({
          type: "action",
          action: {
            kind: "collect_field",
            field: "goal",
            label: "训练目标",
            inputType: "select",
            options: [
              { value: "race", label: "备赛 / 提升成绩" },
              { value: "fitness", label: "日常健身 / 保持体能" },
              { value: "weight", label: "减脂 / 控制体重" },
              { value: "fun", label: "享受骑行乐趣" },
            ],
          },
        });
      }
      break;
    }

    case "ask_ftp": {
      const f = userMessage.trim();
      if (f && f !== "skip" && f !== "跳过") {
        const num = parseInt(f, 10);
        if (!isNaN(num) && num >= 80 && num <= 500) {
          newState.collectedData.ftp = num;
          chunks.push({ type: "action", action: { kind: "set_user_field", field: "ftp", value: num } });
        }
      }
      newState.completedSteps.push("ask_ftp");
      newState.currentStep = "ask_goal";

      chunks.push(text("最后一个问题：你骑车的主要目标是什么？"));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "goal",
          label: "训练目标",
          inputType: "select",
          options: [
            { value: "race", label: "备赛 / 提升成绩" },
            { value: "fitness", label: "日常健身 / 保持体能" },
            { value: "weight", label: "减脂 / 控制体重" },
            { value: "fun", label: "享受骑行乐趣" },
          ],
        },
      });
      break;
    }

    case "ask_hr_zones": {
      const h = userMessage.trim();
      if (h && h !== "skip" && h !== "跳过") {
        const num = parseInt(h, 10);
        if (!isNaN(num) && num >= 120 && num <= 230) {
          newState.collectedData.maxHr = num;
          chunks.push({ type: "action", action: { kind: "set_user_field", field: "maxHr", value: num } });
        }
      }
      newState.completedSteps.push("ask_hr_zones");
      newState.currentStep = "ask_goal";

      chunks.push(text("最后一个问题：你骑车的主要目标是什么？"));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "goal",
          label: "训练目标",
          inputType: "select",
          options: [
            { value: "race", label: "备赛 / 提升成绩" },
            { value: "fitness", label: "日常健身 / 保持体能" },
            { value: "weight", label: "减脂 / 控制体重" },
            { value: "fun", label: "享受骑行乐趣" },
          ],
        },
      });
      break;
    }

    case "ask_goal": {
      const goal = userMessage.trim();
      newState.collectedData.goal = goal;
      newState.completedSteps.push("ask_goal");
      newState.currentStep = "summary";

      const name = newState.collectedData.name ?? "骑友";
      const userType = newState.collectedData.userType;
      const typeLabel = userType === "power" ? "功率训练" : userType === "watch" ? "智能手表" : "基础";

      let summary = `设置完成！\n\n**${name}** — ${typeLabel}模式`;
      if (newState.collectedData.weightKg) summary += `\n体重：${newState.collectedData.weightKg}kg`;
      if (newState.collectedData.ftp) summary += `\nFTP：${newState.collectedData.ftp}W`;
      if (newState.collectedData.maxHr) summary += `\n最大心率：${newState.collectedData.maxHr}bpm`;
      if (newState.collectedData.intervalsApiKey) summary += `\nintervals.icu：已配置`;
      if (newState.collectedData.primaryDevice) summary += `\n设备：${newState.collectedData.primaryDevice}`;

      summary += "\n\n一切就绪，现在进入系统？";

      chunks.push(text(summary));
      chunks.push({
        type: "action",
        action: {
          kind: "collect_field",
          field: "confirm",
          label: "确认",
          inputType: "select",
          options: [
            { value: "yes", label: "进入系统" },
            { value: "sync_first", label: "先同步数据再进入" },
          ],
        },
      });
      break;
    }

    case "summary": {
      const confirm = userMessage.trim().toLowerCase();
      newState.completedSteps.push("summary");
      newState.currentStep = "completed";

      if (confirm === "sync_first" && newState.collectedData.intervalsApiKey) {
        chunks.push(text("正在为你同步 intervals.icu 数据..."));
        chunks.push({ type: "action", action: { kind: "sync", source: "intervals" } });
      }

      chunks.push(text("欢迎使用 AI 骑行助手！随时点击右下角的助手按钮与我交流。"));
      chunks.push({ type: "action", action: { kind: "complete_onboarding" } });
      chunks.push({ type: "action", action: { kind: "navigate", path: "/analytics" } });
      break;
    }

    case "completed": {
      chunks.push(text("你已经完成了初始设置。有什么想问的？"));
      chunks.push({
        type: "action",
        action: {
          kind: "suggest_prompts",
          prompts: ["看看我的训练数据", "如何提升 FTP？", "今天该怎么训练？"],
        },
      });
      break;
    }
  }

  return { chunks, newState };
}
