import type { Candidate, ScreeningResult } from "../types/index.js";

export function buildEmailSubject(
  result: ScreeningResult,
  candidateName: string,
): string {
  return `[招聘筛选] ${result.positionName} - ${candidateName} (匹配度: ${result.score}分)`;
}

export function buildEmailBody(
  candidate: Candidate,
  result: ScreeningResult,
): string {
  const profile = candidate.rawProfile;
  const skills = profile.skills.length > 0 ? profile.skills.join(", ") : "未提取";
  const experience =
    profile.experienceYears != null ? `${profile.experienceYears}年` : "未知";
  const salary =
    profile.salaryExpectation != null
      ? `${profile.salaryExpectation / 1000}K`
      : "面议";
  const status = profile.status ?? "未知";

  const workHistoryRows = profile.workHistory
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.company)}</td><td>${escapeHtml(w.title)}</td><td>${escapeHtml(w.startDate ?? "")}</td></tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px;">
<h2>招聘筛选结果 - ${escapeHtml(candidate.name)}</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tr><td><strong>姓名</strong></td><td>${escapeHtml(candidate.name)}</td></tr>
  <tr><td><strong>应聘职位</strong></td><td>${escapeHtml(result.positionName)}</td></tr>
  <tr><td><strong>匹配分数</strong></td><td>${result.score}/${result.matchDetails.threshold} (阈值)</td></tr>
  <tr><td><strong>求职状态</strong></td><td>${escapeHtml(status)}</td></tr>
  <tr><td><strong>核心技能</strong></td><td>${escapeHtml(skills)}</td></tr>
  <tr><td><strong>工作年限</strong></td><td>${escapeHtml(experience)}</td></tr>
  <tr><td><strong>期望薪资</strong></td><td>${escapeHtml(salary)}</td></tr>
</table>

${
  workHistoryRows
    ? `<h3>工作经历</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tr><th>公司</th><th>职位</th><th>时间</th></tr>
  ${workHistoryRows}
</table>`
    : ""
}

<p style="color: #888; margin-top: 20px;">
  回复 <strong>"约面试"</strong> 安排面试 | 回复 <strong>"淘汰"</strong> 淘汰该候选人
</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
