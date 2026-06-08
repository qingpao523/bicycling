"use client";

import { useState } from "react";

export interface RiderData {
  id?: string;
  role: "self" | "teammate" | "opponent";
  name: string;
  ftp?: number | null;
  weightKg?: number | null;
  wpKg5min?: number | null;
  wpKg1min?: number | null;
  strength?: string | null;
  weakness?: string | null;
  note?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  self: "我",
  teammate: "队友",
  opponent: "对手",
};

const ROLE_COLORS: Record<string, string> = {
  self: "var(--accent)",
  teammate: "var(--success, #22c55e)",
  opponent: "var(--danger, #ef4444)",
};

const STRENGTH_OPTIONS = ["爬坡", "冲刺", "计时", "全能", "耐力"];

export function RiderCard({
  rider,
  onRemove,
  readonly,
}: {
  rider: RiderData;
  onRemove?: () => void;
  readonly?: boolean;
}) {
  const wpkg = rider.ftp && rider.weightKg ? (rider.ftp / rider.weightKg).toFixed(2) : null;

  return (
    <div className="rider-card" style={{ borderColor: ROLE_COLORS[rider.role] }}>
      <div className="rider-card-header">
        <span className="rider-role-badge" style={{ background: ROLE_COLORS[rider.role] }}>
          {ROLE_LABELS[rider.role]}
        </span>
        <span className="rider-name">{rider.name}</span>
        {!readonly && onRemove && rider.role !== "self" && (
          <button type="button" className="rider-remove-btn" onClick={onRemove}>×</button>
        )}
      </div>
      <div className="rider-card-stats">
        {rider.ftp && <span>FTP {rider.ftp}W</span>}
        {rider.weightKg && <span>{rider.weightKg}kg</span>}
        {wpkg && <span>{wpkg} W/kg</span>}
        {rider.wpKg5min && <span>5min {rider.wpKg5min} W/kg</span>}
        {rider.wpKg1min && <span>1min {rider.wpKg1min} W/kg</span>}
      </div>
      {(rider.strength || rider.weakness) && (
        <div className="rider-card-traits">
          {rider.strength && <span className="rider-strength">💪 {rider.strength}</span>}
          {rider.weakness && <span className="rider-weakness">⚠️ {rider.weakness}</span>}
        </div>
      )}
    </div>
  );
}

export function RiderForm({
  role,
  onAdd,
}: {
  role: "teammate" | "opponent";
  onAdd: (rider: RiderData) => void;
}) {
  const [name, setName] = useState("");
  const [ftp, setFtp] = useState("");
  const [weight, setWeight] = useState("");
  const [wpKg5min, setWpKg5min] = useState("");
  const [wpKg1min, setWpKg1min] = useState("");
  const [strength, setStrength] = useState("");
  const [weakness, setWeakness] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    onAdd({
      role,
      name: name.trim(),
      ftp: ftp ? Number(ftp) : null,
      weightKg: weight ? Number(weight) : null,
      wpKg5min: wpKg5min ? Number(wpKg5min) : null,
      wpKg1min: wpKg1min ? Number(wpKg1min) : null,
      strength: strength || null,
      weakness: weakness || null,
    });
    setName("");
    setFtp("");
    setWeight("");
    setWpKg5min("");
    setWpKg1min("");
    setStrength("");
    setWeakness("");
  }

  return (
    <div className="rider-form">
      <div className="rider-form-row">
        <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="FTP (W)" type="number" value={ftp} onChange={(e) => setFtp(e.target.value)} />
        <input placeholder="体重 (kg)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>
      <div className="rider-form-row">
        <input placeholder="5min W/kg" type="number" step="0.1" value={wpKg5min} onChange={(e) => setWpKg5min(e.target.value)} />
        <input placeholder="1min W/kg" type="number" step="0.1" value={wpKg1min} onChange={(e) => setWpKg1min(e.target.value)} />
        <select value={strength} onChange={(e) => setStrength(e.target.value)}>
          <option value="">特长</option>
          {STRENGTH_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="rider-form-row">
        <input placeholder="弱点（可选）" value={weakness} onChange={(e) => setWeakness(e.target.value)} className="flex-1" />
        <button type="button" onClick={handleSubmit} className="btn-add-rider">
          添加{ROLE_LABELS[role]}
        </button>
      </div>
    </div>
  );
}
