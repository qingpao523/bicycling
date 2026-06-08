"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteProfileChart } from "./route-profile-chart";
import { RiderCard, RiderForm, type RiderData } from "./rider-card";
import type { RouteProfile } from "@/lib/engine/gpx-parser";

interface Props {
  selfRider: RiderData;
}

export function PlanBuilder({ selfRider }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [weatherNote, setWeatherNote] = useState("");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [route, setRoute] = useState<RouteProfile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [teammates, setTeammates] = useState<RiderData[]>([]);
  const [opponents, setOpponents] = useState<RiderData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleGpxChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGpxFile(file);
    setParseError(null);

    try {
      const text = await file.text();
      const { parseGpx } = await import("@/lib/engine/gpx-parser");
      const parsed = parseGpx(text);
      if (parsed.segments.length === 0) {
        setParseError("未能解析出有效路段，请检查 GPX 文件");
        setRoute(null);
      } else {
        setRoute(parsed);
      }
    } catch {
      setParseError("文件读取失败");
      setRoute(null);
    }
  }, []);

  const allRiders = useMemo(() => {
    return [selfRider, ...teammates, ...opponents];
  }, [selfRider, teammates, opponents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gpxFile || !name.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("gpx", gpxFile);
    if (raceDate) formData.set("raceDate", raceDate);
    if (weatherNote) formData.set("weatherNote", weatherNote);

    try {
      const res = await fetch("/api/race-plan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "创建失败");
        setSubmitting(false);
        return;
      }

      const planId = data.plan.id;

      // Add riders
      for (const rider of [...teammates, ...opponents]) {
        await fetch(`/api/race-plan/${planId}/riders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rider),
        });
      }

      // Add self
      await fetch(`/api/race-plan/${planId}/riders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selfRider),
      });

      router.push(`/race-plan/${planId}`);
    } catch {
      setSubmitError("网络错误");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="plan-builder">
      <section className="plan-builder-section">
        <h3>基本信息</h3>
        <div className="plan-builder-row">
          <input
            placeholder="计划名称（如：环太湖第三站）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="plan-name-input"
          />
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="plan-date-input"
          />
        </div>
        <input
          placeholder="天气备注（可选，如：34°C 高温 南风3级）"
          value={weatherNote}
          onChange={(e) => setWeatherNote(e.target.value)}
        />
      </section>

      <section className="plan-builder-section">
        <h3>路线 GPX</h3>
        <label className="gpx-upload-label">
          <input
            type="file"
            accept=".gpx"
            onChange={handleGpxChange}
            className="gpx-file-input"
          />
          <span className="gpx-upload-text">
            {gpxFile ? gpxFile.name : "点击选择 GPX 文件"}
          </span>
        </label>
        {parseError && <p className="form-error">{parseError}</p>}
        {route && <RouteProfileChart route={route} />}
      </section>

      <section className="plan-builder-section">
        <h3>我的数据</h3>
        <RiderCard rider={selfRider} readonly />
      </section>

      <section className="plan-builder-section">
        <h3>队友 ({teammates.length})</h3>
        {teammates.map((t, i) => (
          <RiderCard
            key={i}
            rider={t}
            onRemove={() => setTeammates((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
        <RiderForm role="teammate" onAdd={(r) => setTeammates((prev) => [...prev, r])} />
      </section>

      <section className="plan-builder-section">
        <h3>对手 ({opponents.length})</h3>
        {opponents.map((o, i) => (
          <RiderCard
            key={i}
            rider={o}
            onRemove={() => setOpponents((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
        <RiderForm role="opponent" onAdd={(r) => setOpponents((prev) => [...prev, r])} />
      </section>

      {submitError && <p className="form-error">{submitError}</p>}

      <button
        type="submit"
        disabled={!gpxFile || !name.trim() || submitting}
        className="btn-primary btn-generate"
      >
        {submitting ? "创建中..." : "创建计划"}
      </button>
    </form>
  );
}
