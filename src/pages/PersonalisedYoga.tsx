import React, { useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { CapacitorHttp } from "@capacitor/core";
import { EXTERNAL_GENERATE_ASANA_PLAN } from "../constants";
import { isNativeRuntime } from "../utils/platform";

export const PersonalisedYoga: React.FC = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Generating your personalized yoga plan...");

  useEffect(() => {
    const generateAsanaPlan = async () => {
      try {
        // Get user ID from Preferences
        let userId: number | null = null;
        const { value: storedId } = await Preferences.get({ key: "onlineUserId" });
        
        if (storedId) {
          const parsed = Number(storedId);
          if (Number.isFinite(parsed)) userId = parsed;
        }

        if (!userId) {
          const { value: userInfoJson } = await Preferences.get({ key: "userInfo" });
          if (userInfoJson) {
            try {
              const ui = JSON.parse(userInfoJson) as any;
              if (ui && (ui.id || ui.userId || ui._id)) {
                userId = Number(ui.id || ui.userId || ui._id) || null;
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        if (!userId) {
          throw new Error("User ID not found. Please log in and try again.");
        }

        // Get access token
        const { value: token } = await Preferences.get({ key: "accessToken" });
        if (!token) {
          throw new Error("Authentication token not found. Please log in again.");
        }

        const url = `${EXTERNAL_GENERATE_ASANA_PLAN}/${userId}`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        };

        let response: { status: number; data: any };

        if (isNativeRuntime()) {
          response = await CapacitorHttp.get({
            url,
            headers,
          });
        } else {
          const res = await fetch(url, {
            method: "GET",
            headers,
          });
          const text = await res.text();
          let parsed: any = {};
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          }
          response = { status: res.status, data: parsed };
        }

        if (response.status < 200 || response.status >= 300) {
          const errorMsg =
            (response.data && typeof response.data === "object" && response.data.message) ||
            (typeof response.data === "string" && response.data.trim()) ||
            `Failed to generate plan (status: ${response.status})`;
          throw new Error(errorMsg);
        }

        setStatus("success");
        setMessage("Your personalized yoga plan is ready!");
        
        // Redirect to PersonalisedAsanaPlan after a short delay
        setTimeout(() => {
          window.history.pushState(null, "", "/personalised-asana-plan");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 1500);
      } catch (error) {
        console.error("Error generating asana plan:", error);
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Failed to generate yoga plan. Please try again."
        );
      }
    };

    generateAsanaPlan();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        textAlign: "center",
        backgroundColor: "#f5f5f5",
      }}
    >
      <div
        style={{
          maxWidth: "500px",
          padding: "40px",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ marginBottom: "20px", color: "#333" }}>Personalised Yoga</h1>
        
        {status === "loading" && (
          <div>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid #f3f3f3",
                borderTop: "4px solid #3498db",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "20px auto",
              }}
            />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
        
        {status === "success" && (
          <div style={{ color: "#27ae60", fontSize: "48px", margin: "20px 0" }}>✓</div>
        )}
        
        {status === "error" && (
          <div style={{ color: "#e74c3c", fontSize: "48px", margin: "20px 0" }}>✗</div>
        )}
        
        <p style={{ fontSize: "18px", color: status === "error" ? "#e74c3c" : "#666", marginTop: "20px" }}>
          {message}
        </p>
        
        {status === "error" && (
          <button
            onClick={() => {
              window.history.pushState(null, "", "/home");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            style={{
              marginTop: "20px",
              padding: "12px 24px",
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
};
