"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/race-plan/${planId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "生成失败");
      } else {
        router.refresh();
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary btn-generate"
      >
        {loading ? "生成中..." : "生成战术方案"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
