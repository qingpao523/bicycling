"use client";

export function SciencePanel() {
  return (
    <div className="science-panel">
      <details>
        <summary className="science-panel-toggle">
          运动生理学原理与评分依据
        </summary>

        <div className="science-panel-content">
          <section>
            <h4>I. TRIMP 训练冲量模型</h4>
            <p>
              训练冲量（Training Impulse, TRIMP）是量化单次训练负荷的经典方法，由 Banister（1991）提出。
              核心思想：训练负荷 = 持续时间 × 强度加权，高强度训练产生不成比例的负荷。
            </p>

            <h5>Banister TRIMP（1991）</h5>
            <p className="science-formula">
              TRIMP = t × ΔHR × 0.64 × e<sup>(y × ΔHR)</sup>
            </p>
            <p>
              其中 ΔHR = (运动心率 - 静息心率) / (最大心率 - 静息心率)，
              y = 1.92（男性）/ 1.67（女性）。指数加权意味着高强度区间获得远超线性的"训练信用"，
              反映了血乳酸随强度呈指数上升的生理现实。
            </p>

            <h5>Edwards TRIMP（1993）</h5>
            <p className="science-formula">
              TRIMP = Σ (t<sub>zone</sub> × zone_weight)
            </p>
            <p>
              将心率分为 5 个区间（50-60%、60-70%、70-80%、80-90%、90-100% HRmax），
              每个区间的时间乘以 1-5 的权重系数。计算简单，广泛用于团队运动。
            </p>

            <h5>Lucia TRIMP（2003）</h5>
            <p>
              基于通气阈值（VT1/VT2）将强度分为 3 个区间，权重 1/2/3。
              专为职业公路自行车设计，需要实验室递增测试确定阈值。
              被认为比 Edwards 方法在生理上更有效，因为区间锚定于实际代谢阈值。
            </p>
          </section>

          <section>
            <h4>II. HRV 自主神经监测</h4>
            <p>
              心率变异性（HRV）反映心脏节律的逐搏波动，是监测运动员自主神经恢复的金标准指标。
              推荐使用 RMSSD（连续 R-R 间期差异的均方根），它主要反映副交感（迷走）神经调节。
            </p>

            <h5>Plews / Buchheit 模型</h5>
            <p>
              监测运动员 HRV 的最佳实践不是看单日数值，而是追踪：
            </p>
            <ul>
              <li><strong>7 天滚动均值</strong>（lnRMSSD）— 反映潜在的迷走神经张力趋势</li>
              <li><strong>7 天滚动 CV（变异系数）</strong>— 反映日间波动程度</li>
            </ul>

            <table className="science-table">
              <thead>
                <tr><th>滚动均值</th><th>滚动 CV</th><th>解读</th></tr>
              </thead>
              <tbody>
                <tr><td>稳定/上升</td><td>低/稳定</td><td>良好适应，训练耐受良好</td></tr>
                <tr><td>稳定/上升</td><td>升高</td><td>功能性过度训练 — 密切关注</td></tr>
                <tr><td>下降</td><td>低（被抑制）</td><td>非功能性过度训练 — 减负荷</td></tr>
                <tr><td>下降</td><td>升高</td><td>过度训练风险 — 紧急减负</td></tr>
              </tbody>
            </table>

            <p>
              <strong>SWC（最小有意义变化）</strong> = 0.5 × 个体 lnRMSSD 标准差。
              低于 SWC 的变化视为正常波动，不应引起警觉。
            </p>
          </section>

          <section>
            <h4>III. 睡眠与运动恢复</h4>
            <p>
              睡眠是运动恢复最关键的单一因素。美国睡眠医学会建议运动员每晚 8-10 小时。
            </p>
            <ul>
              <li>
                <strong>Mah 等（2011）</strong>：Stanford 大学篮球队员将睡眠延长至约 10 小时/晚，
                5-7 周后冲刺时间改善、罚球命中率提高 9%、三分命中率提高 9.2%、
                反应时间改善、白天嗜睡减少。
              </li>
              <li>
                <strong>Roberts 等（2019）meta 分析</strong>：训练期间 23/41 项研究中运动员未达到推荐睡眠时长；
                比赛当晚总睡眠时间比前一晚平均减少约 60 分钟。
              </li>
              <li>
                <strong>PSQI（匹兹堡睡眠质量指数）</strong>：总分 0-21，超过 5 分即为睡眠不佳。
                涵盖 7 个维度：主观质量、入睡潜伏期、时长、效率、干扰、用药、日间功能障碍。
              </li>
            </ul>
          </section>

          <section>
            <h4>IV. ACWR 急慢性负荷比</h4>
            <p>
              急慢性负荷比（Acute:Chronic Workload Ratio）= 7天急性负荷（ATL）/ 28-42天慢性负荷（CTL）。
              本系统直接利用 PMC 体能管理表中已计算的 CTL 和 ATL。
            </p>

            <table className="science-table">
              <thead>
                <tr><th>ACWR 范围</th><th>状态</th><th>风险</th></tr>
              </thead>
              <tbody>
                <tr><td>&lt; 0.8</td><td>训练不足 / 停训</td><td>适应能力下降</td></tr>
                <tr><td className="science-highlight">0.8 – 1.3</td><td className="science-highlight">甜区</td><td className="science-highlight">最优训练区间，低受伤风险</td></tr>
                <tr><td>1.3 – 1.5</td><td>偏高</td><td>受伤风险上升</td></tr>
                <tr><td>&gt; 1.5</td><td>危险区</td><td>受伤风险显著升高</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4>V. 本系统评分权重</h4>
            <table className="science-table">
              <thead>
                <tr><th>因子</th><th>权重</th><th>文献依据</th></tr>
              </thead>
              <tbody>
                <tr><td>HRV</td><td>30%</td><td>最敏感的急性自主神经恢复指标（Plews 2013, Buchheit 2014）</td></tr>
                <tr><td>静息心率</td><td>15%</td><td>与 HRV 互补但敏感度较低（Borresen & Lambert 2008）</td></tr>
                <tr><td>睡眠</td><td>25%</td><td>恢复的关键决定因素（Mah 2011, Roberts 2019）</td></tr>
                <tr><td>训练负荷</td><td>30%</td><td>ACWR 是疲劳/适应平衡的主要驱动（Gabbett 2016）</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4>VI. 训练负荷评分逻辑</h4>
            <p>
              基于 ACWR（急慢性负荷比 = ATL / CTL）计算训练负荷评分：
            </p>
            <table className="science-table">
              <thead>
                <tr><th>ACWR 范围</th><th>评分区间</th><th>说明</th></tr>
              </thead>
              <tbody>
                <tr><td className="science-highlight">0.8 – 1.3</td><td className="science-highlight">85 – 100</td><td className="science-highlight">甜区，越接近 1.05 越高分</td></tr>
                <tr><td>&lt; 0.8</td><td>30 – 80</td><td>训练不足 / 停训风险</td></tr>
                <tr><td>1.3 – 1.5</td><td>55 – 85</td><td>负荷偏高</td></tr>
                <tr><td>&gt; 1.5</td><td>0 – 55</td><td>高风险区，受伤概率显著上升</td></tr>
              </tbody>
            </table>
            <p>
              <strong>额外修正</strong>：TSB &lt; -30 时额外扣 15 分（深度疲劳）；
              CTL &lt; 5 时 ACWR 不可靠，改用 TSB 兜底评分（TSB ≥ 0 给 60 分，否则按 TSB 线性衰减）。
            </p>
          </section>

          <section>
            <h4>参考文献</h4>
            <ol className="science-references">
              <li>Banister EW. (1991). Modeling Elite Athletic Performance. In: <em>Physiological Testing of Elite Athletes</em>. Human Kinetics, pp. 403-424.</li>
              <li>Edwards S. (1993). High performance training and racing. In: <em>The Heart Rate Monitor Book</em>. Fleet Feet Press, pp. 113-123.</li>
              <li>Lucia A, Hoyos J, Santalla A, et al. (2003). Tour de France versus Vuelta a Espana: which is harder? <em>Med Sci Sports Exerc</em>, 35(5), 872-878.</li>
              <li>Gabbett TJ. (2016). The training-injury prevention paradox: should athletes be training smarter and harder? <em>Br J Sports Med</em>, 50(5), 273-280.</li>
              <li>Plews DJ, Laursen PB, Stanley J, et al. (2013). Training Adaptation and Heart Rate Variability in Elite Endurance Athletes. <em>Sports Medicine</em>, 43(9), 773-781.</li>
              <li>Buchheit M. (2014). Monitoring training status with HR measures: do all roads lead to Rome? <em>Frontiers in Physiology</em>, 5, 73.</li>
              <li>Bellenger CR, Fuller JT, Thomson RL, et al. (2016). Monitoring Athletic Training Status Through Autonomic Heart Rate Regulation: A Systematic Review. <em>Sports Medicine</em>, 46(10), 1461-1486.</li>
              <li>Kiviniemi AM, Hautala AJ, Kinnunen H, et al. (2007). Daily exercise prescription on the basis of HR variability. <em>Med Sci Sports Exerc</em>, 39(7), 1212-1218.</li>
              <li>Borresen J, Lambert MI. (2008). Autonomic control of heart rate during and after exercise. <em>Sports Medicine</em>, 38(8), 633-646.</li>
              <li>Mah CD, Mah KE, Kezirian EJ, Dement WC. (2011). The effects of sleep extension on the athletic performance of collegiate basketball players. <em>Sleep</em>, 34(7), 943-950.</li>
              <li>Roberts SSH, Teo WP, Warmington SA. (2019). Effects of training and competition on the sleep of elite athletes: a systematic review and meta-analysis. <em>Br J Sports Med</em>, 53(8), 513-522.</li>
              <li>Buysse DJ, Reynolds CF, Monk TH, et al. (1989). The Pittsburgh Sleep Quality Index: a new instrument. <em>Psychiatry Research</em>, 28(2), 193-213.</li>
              <li>Samuels C, James L, Lawson D, Meeuwisse W. (2016). The Athlete Sleep Screening Questionnaire. <em>Br J Sports Med</em>, 50(7), 418-422.</li>
              <li>Hooper SL, Mackinnon LT, Howard A, et al. (1995). Markers for monitoring overtraining and recovery. <em>Med Sci Sports Exerc</em>, 27(1), 106-112.</li>
              <li>Aubert AE, Seps B, Beckers F. (2003). Heart rate variability in athletes. <em>Sports Medicine</em>, 33(12), 889-919.</li>
            </ol>
          </section>
        </div>
      </details>
    </div>
  );
}
