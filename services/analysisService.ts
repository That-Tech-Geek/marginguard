import { DecisionObject } from "../types";
import { AlertTriangle, CheckCircle, PauseCircle, XCircle, RefreshCcw, ShieldAlert, Zap } from "lucide-react";

export const getDecisionHighlights = (decision: DecisionObject) => {
  const { decision_state, issue, root_cause, recommended_action } = decision;
  
  let color = "zinc";
  let Icon = XCircle;
  let label = "Unknown Status";
  
  switch (decision_state) {
      case "RECOMMENDED":
          color = "emerald";
          Icon = CheckCircle;
          label = "Auto-Approval";
          break;
      case "CONDITIONAL":
          color = "amber";
          Icon = AlertTriangle;
          label = "Conditional Logic";
          break;
      case "HOLD":
          color = "rose";
          Icon = PauseCircle;
          label = "Human Review Req";
          break;
      case "INSUFFICIENT_EVIDENCE":
          color = "zinc";
          Icon = XCircle;
          label = "Data Gathering";
          break;
  }

  // Icon based on driver
  let DriverIcon = Zap;
  if (issue.includes('retries')) DriverIcon = RefreshCcw;
  if (issue.includes('Reporting')) DriverIcon = ShieldAlert;
  
  return {
      color,
      Icon,
      label,
      headline: issue,
      subhead: root_cause,
      action: recommended_action.action,
      DriverIcon
  };
};