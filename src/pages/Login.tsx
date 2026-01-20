import React, { useEffect, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import "../styles/Login.css";

import logo from "../assets/Nirvaana Yoga logo- circular image 1.png";
import { OTP_ENDPOINT, OTP_VERIFY_ENDPOINT, OAUTH_SIGNIN_ENDPOINT, GOOGLE_CLIENT_ID, SESSION_TIMESTAMP_KEY, LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI, LINKEDIN_OAUTH_ENDPOINT } from "../constants";
import { Otp } from "./Otp";
import { isNativeRuntime } from "../utils/platform";

type JsonResponse = {
  status: number;
  data: unknown;
};

type RequestStatus = "idle" | "loading" | "success" | "error";

const isErrorRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null;

const persistSessionTimestamp = async () => {
  await Preferences.set({ key: SESSION_TIMESTAMP_KEY, value: Date.now().toString() });
};

const parseResponseData = (value: unknown) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/* ------------------------------------------------------------------
   UNIVERSAL POST CALL -- Works for Android, iOS, Web
------------------------------------------------------------------ */
const postJson = async (url: string, body: Record<string, unknown>): Promise<JsonResponse> => {
  if (isNativeRuntime()) {
    try {
      const response = await CapacitorHttp.request({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: body,
        connectTimeout: 15000,
      });

      return { status: response.status, data: parseResponseData(response.data) };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to reach the server.";
      const platformHint =
        " Ensure the Android network security config trusts https://apiservices.nirvaanayoga.com:8443.";
      throw new Error(`${msg}.${platformHint}`);
    }
  }

  const fetchRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await fetchRes.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: fetchRes.status, data: parsed };
};

/* ------------------------------------------------------------------
   LOGIN COMPONENT
------------------------------------------------------------------ */
export const Login: React.FC = () => {
  const [countryCode, setCountryCode] = useState<string>("+91");
  const [mobile, setMobile] = useState<string>("");
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [feedback, setFeedback] = useState("");
  const [otp, setOtp] = useState("");
  const [route, setRoute] = useState<string>(
    typeof window === "undefined" ? "/login" : window.location.pathname
  );

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Initialize Google One-Tap once on mount (for automatic sign-in)
  useEffect(() => {
    if (typeof window === "undefined" || !GOOGLE_CLIENT_ID) return;
    if (route !== "/login") return; // Only on login page

    const googleObj = (window as any).google;
    if (!googleObj?.accounts?.id) return;

    const handleGoogleCallback = async (response: any) => {
      if (!response || !response.credential) return;
      const idToken = response.credential as string;
      
      try {
        const parts = idToken.split(".");
        if (parts.length < 2) return;
        const payload = parts[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        const decoded = JSON.parse(decodeURIComponent(escape(json)));
        const email = decoded?.email;
        const name = decoded?.name;
        const subject = decoded?.sub;
        
        // Send to backend
        setStatus("loading");
        setFeedback("");
        const body = {
          accessToken: idToken,
          email,
          name,
          subject,
          userRole: "USER"
        };
        
        const resp = await postJson(OAUTH_SIGNIN_ENDPOINT, body);
        if (resp.status < 200 || resp.status >= 300) {
          const err = resp.data;
          const msg = isErrorRecord(err) && (err.message || err.error) ? err.message || err.error : "Unable to create/login user via Google right now.";
          throw new Error(msg);
        }

        if (isErrorRecord(resp.data)) {
          const token = resp.data.accessToken || resp.data.token;
          if (typeof token === "string") {
            await Preferences.set({ key: "accessToken", value: token });
            await persistSessionTimestamp();
          }
          if (resp.data.userInfo && typeof resp.data.userInfo === "object") {
            await Preferences.set({ key: "userInfo", value: JSON.stringify(resp.data.userInfo) });
          }
        }

        setStatus("success");
        setFeedback("Logged in with Google.");
        navigate("/home");
      } catch (err) {
        console.error("Google login error:", err);
        setStatus("error");
        setFeedback(err instanceof Error ? err.message : String(err));
      }
    };

    try {
      googleObj.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });

      // Show One-Tap prompt automatically (non-blocking)
      googleObj.accounts.id.prompt();
    } catch (e) {
      console.warn("One-Tap initialization failed:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const navigate = (path: "/login" | "/otp" | "/home") => {
    window.history.pushState(null, "", path);
    setRoute(path);
  };

  const handleMobileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 10) {
      setMobile(value);
    }
  };

  const sanitizedMobile = mobile.trim();
  const isValidMobile = /^\d{10}$/.test(sanitizedMobile);
  const isValidOtp = /^\d{4}$/.test(otp);
  const serverPhoneNumber = sanitizedMobile;

  const showErrorFeedback = (message: string) => {
    setStatus("error");
    setFeedback(message);
  };

  // Decode a JWT (ID token) payload without validating (used to extract name/email)
  const decodeJwtPayload = (jwt: string): any | null => {
    try {
      const parts = jwt.split(".");
      if (parts.length < 2) return null;
      const payload = parts[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      return null;
    }
  };

  const createUserWithGoogle = async (
    credential: string,
    email?: string,
    name?: string,
    role = "USER",
    subject?: string
  ) => {
    setStatus("loading");
    setFeedback("");
    try {
      const body: Record<string, unknown> = {
        userRole: role,
        accessToken: credential,
      };
      
      if (email) body.email = email;
      if (name) body.name = name;
      if (subject) body.subject = subject;

      const response = await postJson(OAUTH_SIGNIN_ENDPOINT, body);
      if (response.status < 200 || response.status >= 300) {
        const err = response.data;
        const msg = isErrorRecord(err) && (err.message || err.error) ? err.message || err.error : "Unable to create/login user via Google right now.";
        throw new Error(msg);
      }

      if (isErrorRecord(response.data)) {
        const token = response.data.accessToken || response.data.token;
        if (typeof token === "string") {
          await Preferences.set({ key: "accessToken", value: token });
          await persistSessionTimestamp();
        }
        if (response.data.userInfo && typeof response.data.userInfo === "object") {
          await Preferences.set({ key: "userInfo", value: JSON.stringify(response.data.userInfo) });
        }
      }

      setStatus("success");
      setFeedback("Logged in with Google.");
      navigate("/home");
    } catch (err) {
      console.error("Google login/create error:", err);
      showErrorFeedback(err instanceof Error ? err.message : String(err));
    }
  };
  // Add this function alongside your createUserWithGoogle function

const createUserWithLinkedIn = async (
  credential: string,
  email?: string,
  name?: string,
  role = "USER",
  linkedinId?: string
) => {
  setStatus("loading");
  setFeedback("");
  try {
    const body: Record<string, unknown> = {
      userRole: role,
      accessToken: credential,
      provider: "linkedin",
    };
    
    if (email) body.email = email;
    if (name) body.name = name;
    if (linkedinId) body.linkedinId = linkedinId;

    const response = await postJson(OAUTH_SIGNIN_ENDPOINT, body);
    if (response.status < 200 || response.status >= 300) {
      const err = response.data;
      const msg = isErrorRecord(err) && (err.message || err.error) 
        ? err.message || err.error 
        : "Unable to create/login user via LinkedIn right now.";
      throw new Error(msg);
    }

    if (isErrorRecord(response.data)) {
      const token = response.data.accessToken || response.data.token;
      if (typeof token === "string") {
        await Preferences.set({ key: "accessToken", value: token });
        await persistSessionTimestamp();
      }
      if (response.data.userInfo && typeof response.data.userInfo === "object") {
        await Preferences.set({ key: "userInfo", value: JSON.stringify(response.data.userInfo) });
      }
    }

    setStatus("success");
    setFeedback("Logged in with LinkedIn.");
    navigate("/home");
  } catch (err) {
    console.error("LinkedIn login/create error:", err);
    showErrorFeedback(err instanceof Error ? err.message : String(err));
  }
};

  const getSubjectFromIdToken = (idToken: string): string | null => {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(decodeURIComponent(escape(payload)));
    return decoded?.sub || null;
  } catch {
    return null;
  }
};


  // Handle Google sign-in via Google Identity Services (web & mobile web). Falls back to popup flow if needed.
  const handleGoogleLogin = async () => {
 
   
    try {
   
      if (isNativeRuntime()) {
          try {
            const platformGoogle =
              (globalThis as any).GoogleAuth ||
              (globalThis as any).Capacitor?.Plugins?.GoogleAuth;

            if (!platformGoogle) {
              throw new Error("Google native auth plugin not available");
            }
                  if (platformGoogle.signOut) {
              try {
                await platformGoogle.signOut();
                console.log("Cleared previous Google sign-in");
              } catch (e) {
                console.log("No previous sign-in to clear");
              }
            }


            const result = await platformGoogle.signIn();
            const idToken = result.idToken || result.authentication?.idToken;
            console.log(result,"result")
            if (!idToken) {
              throw new Error("No ID token returned from Google");
            }
            const subject =
              getSubjectFromIdToken(idToken) || result.userId ||  result.sub || "1234556765";

            if (!subject) {
              throw new Error("Google subject (sub) missing in native login");
            }


             const a = await createUserWithGoogle(
              idToken,
              result.email,
              result.name,
              "USER",
              subject,
            );

            console.log(a,"a")

            return; // 
          } catch (err) {
            showErrorFeedback("Google login failed on mobile.");
            return;
          }
    }else{
  
      const clientId = GOOGLE_CLIENT_ID;
      if (!clientId) {
        showErrorFeedback("Google Client ID not configured. Set GOOGLE_CLIENT_ID in src/constants.ts.");
        return;
      }

      // Use localhost for development (must be added to Google Cloud Console authorized redirect URIs)
      // Format: http://localhost:3000 or your production domain
      const currentOrigin = window.location.origin;
      const scope = encodeURIComponent("openid email profile");
      const redirect = encodeURIComponent(currentOrigin);
      const nonce = Math.random().toString(36).substring(2);
      const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=id_token&scope=${scope}&redirect_uri=${redirect}&nonce=${nonce}`;
      
      const popup = window.open(oauthUrl, "google_oauth", "width=500,height=600");
      if (!popup) {
        showErrorFeedback("Popup blocked. Allow popups for this site and try again.");
        return;
      }

      // Poll for the redirect with id_token in URL fragment
      const pollInterval = 500;
      const maxAttempts = 120; // ~1 minute
      let attempts = 0;
      const poll = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(poll);
            return;
          }
          
          // Try to access popup location (will throw if cross-origin)
          const popupOrigin = new URL(popup.location.href).origin;
          
          // Check if popup has redirected back to our origin
          if (popupOrigin === currentOrigin) {
            const hash = popup.location.hash || "";
            const params = new URLSearchParams(hash.replace(/^#/, ""));
            const idToken = params.get("id_token");
            const error = params.get("error");
            
            clearInterval(poll);
            popup.close();
            
            if (error) {
              showErrorFeedback(`Google sign-in error: ${error}`);
              return;
            }
            
            if (idToken) {
              const payload = decodeJwtPayload(idToken);
              const email = payload?.email;
              const name = payload?.name;
              const subject = payload?.sub;
              createUserWithGoogle(idToken, email, name, "USER", subject);
              return;
            }
            
            showErrorFeedback("Google sign-in did not return an ID token.");
          }
        } catch (e) {
          // cross-origin while popup on google domain — ignore and continue polling
        }
        attempts += 1;
        if (attempts > maxAttempts) {
          clearInterval(poll);
          try {
            popup.close();
          } catch {}
          showErrorFeedback("Timed out waiting for Google sign-in.");
        }
      }, pollInterval);
}


    } catch (err) {
      console.error("handleGoogleLogin error", err);
      showErrorFeedback("Failed to start Google sign-in.");
    }
  };
const handleLinkedInLogin = async () => {
  try {
    if (!LINKEDIN_CLIENT_ID) {
      showErrorFeedback("LinkedIn Client ID not configured.");
      return;
    }
    const scope = encodeURIComponent("openid profile email");
    const state = Math.random().toString(36).substring(2);
    
    const redirectUri = LINKEDIN_REDIRECT_URI;
    
    console.log("LinkedIn Config:", {
      clientId: LINKEDIN_CLIENT_ID,
      redirectUri: redirectUri,
      scope: "openid profile email"
    });

    const oauthUrl = `${LINKEDIN_OAUTH_ENDPOINT}?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scope}&state=${state}`;

    console.log("Opening LinkedIn OAuth URL:", oauthUrl);

    const popup = window.open(oauthUrl, "linkedin_oauth", "width=600,height=700,scrollbars=yes");
    
    if (!popup) {
      showErrorFeedback("Popup blocked. Please allow popups for this site.");
      return;
    }

    const pollInterval = 500;
    const maxAttempts = 180; 
    let attempts = 0;

    const poll = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(poll);
          console.log("LinkedIn popup was closed");
          return;
        }

        let popupUrl: string;
        try {
          popupUrl = popup.location.href;
        } catch (e) {
          // Cross-origin - still on LinkedIn domain
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(poll);
            try {
              popup.close();
            } catch {}
            showErrorFeedback("LinkedIn login timed out. Please try again.");
          }
          return;
        }

        // Check if URL starts with our redirect URI
        if (popupUrl.startsWith(redirectUri)) {
          console.log("LinkedIn redirected back to:", popupUrl);
          
          const url = new URL(popupUrl);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          const errorDescription = url.searchParams.get("error_description");
          const returnedState = url.searchParams.get("state");

          clearInterval(poll);
          popup.close();

          if (error) {
            console.error("LinkedIn error:", error, errorDescription);
            
            // Specific error handling
            if (error === "invalid_scope_error") {
              showErrorFeedback(
                "LinkedIn scope error. Please ensure 'Sign In with LinkedIn using OpenID Connect' is enabled in your LinkedIn app's Products tab."
              );
            } else {
              showErrorFeedback(`LinkedIn error: ${errorDescription || error}`);
            }
            return;
          }

          if (returnedState !== state) {
            console.error("State mismatch. Expected:", state, "Got:", returnedState);
            showErrorFeedback("Security error: state mismatch. Please try again.");
            return;
          }

          if (code) {
            console.log("LinkedIn authorization code received:", code.substring(0, 10) + "...");
            exchangeLinkedInCode(code);
          } else {
            showErrorFeedback("LinkedIn did not return an authorization code.");
          }
        }
      } catch (e) {
        console.error("LinkedIn polling error:", e);
      }

      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(poll);
        try {
          popup.close();
        } catch {}
        showErrorFeedback("LinkedIn login timed out. Please try again.");
      }
    }, pollInterval);

  } catch (err) {
    console.error("LinkedIn login error:", err);
    showErrorFeedback("Failed to start LinkedIn login.");
  }
};

// ============================================
// STEP 4: Exchange Authorization Code
// ============================================
const exchangeLinkedInCode = async (code: string) => {
  setStatus("loading");
  setFeedback("Connecting to LinkedIn...");

  try {
    console.log("Exchanging LinkedIn code for token...");
    
    // Send to your backend endpoint
    const response = await postJson(
      "https://apiservices.nirvaanayoga.com:8443/api/oauth/linkedin/exchange",
      {
        code: code,
        redirectUri: LINKEDIN_REDIRECT_URI,
      }
    );

    console.log("LinkedIn exchange response status:", response.status);

    if (response.status < 200 || response.status >= 300) {
      const err = response.data;
      const msg = isErrorRecord(err) && err.message
        ? err.message
        : "Failed to connect with LinkedIn. Please try again.";
      throw new Error(msg);
    }

    if (isErrorRecord(response.data)) {
      const { accessToken, email, name, userId, userInfo } = response.data;

      console.log("LinkedIn user data received:", { 
        email, 
        name, 
        userId: userId?.toString().substring(0, 10) 
      });

      if (!accessToken || !email) {
        throw new Error("Incomplete user data from LinkedIn");
      }

      // Store token and userInfo
      await Preferences.set({ key: "accessToken", value: accessToken as string });
      await persistSessionTimestamp();
      
      if (userInfo && typeof userInfo === "object") {
        await Preferences.set({ 
          key: "userInfo", 
          value: JSON.stringify(userInfo) 
        });
      }

      setStatus("success");
      setFeedback("Logged in with LinkedIn.");
      navigate("/home");
    }
  } catch (err) {
    console.error("LinkedIn exchange error:", err);
    showErrorFeedback(
      err instanceof Error ? err.message : "LinkedIn login failed. Please try again."
    );
  }
};



  /* ------------------------------------------------------------------
     SEND OTP
  ------------------------------------------------------------------ */
  const handleSendOtp = async () => {
    if (!isValidMobile || status === "loading") {
      showErrorFeedback("Enter a valid 10-digit mobile number.");
      return;
    }

    setStatus("loading");
    setFeedback("");

    try {
      const response = await postJson(OTP_ENDPOINT, {
        phoneNumber: serverPhoneNumber,
      });

      if (response.status < 200 || response.status >= 300) {
        const err = response.data;
        const msg =
          isErrorRecord(err) && (err.message || err.phoneNumber)
            ? err.message || err.phoneNumber
            : "Unable to send OTP right now.";
        throw new Error(msg);
      }

      setStatus("success");
      setFeedback("OTP sent successfully.");
      setOtp("");
      navigate("/otp");
    } catch (error) {
      console.error("Send OTP Error:", error);
      showErrorFeedback(
        error instanceof Error ? error.message : "Unable to send OTP right now. Try again."
      );
    }
  };

  /* ------------------------------------------------------------------
     VERIFY OTP
  ------------------------------------------------------------------ */
  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValidOtp) {
      showErrorFeedback("Enter the 4-digit OTP.");
      return;
    }

    if (!isValidMobile) {
      showErrorFeedback("Invalid phone number. Please restart the login flow.");
      navigate("/login");
      return;
    }

    setStatus("loading");
    setFeedback("");

    try {
      const response = await postJson(OTP_VERIFY_ENDPOINT, {
        phoneNumber: serverPhoneNumber,
        otp,
        userRole: "USER",
      });

      if (response.status < 200 || response.status >= 300) {
        const err = response.data;
        const msg =
          isErrorRecord(err) && (err.message || err.otp)
            ? err.message || err.otp
            : "Unable to verify OTP right now.";
        throw new Error(msg);
      }

      // Store the token and userInfo in Preferences
      if (isErrorRecord(response.data)) {
        const token = response.data.accessToken || response.data.token;
        if (typeof token === "string") {
          await Preferences.set({ key: "accessToken", value: token });
          await persistSessionTimestamp();
        }
        if (response.data.userInfo && typeof response.data.userInfo === "object") {
          await Preferences.set({ key: "userInfo", value: JSON.stringify(response.data.userInfo) });
        }
      }
      await Preferences.set({key:"MobileNumber",value:"true" })
      setStatus("success");
      setFeedback("OTP verified successfully.");
      setOtp("");
      navigate("/home");
    } catch (error) {
      console.error("Verify OTP Error:", error);
      showErrorFeedback(
        error instanceof Error ? error.message : "Unable to verify OTP right now. Try again."
      );
    }
  };

  /* ------------------------------------------------------------------
     RESET TO LOGIN
  ------------------------------------------------------------------ */
  const resetToLogin = () => {
    navigate("/login");
    setOtp("");
    setFeedback("");
    setStatus("idle");
  };

  /* ------------------------------------------------------------------
     SHOW OTP SCREEN
  ------------------------------------------------------------------ */
  if (route === "/otp") {
    return (
      <Otp
        otp={otp}
        setOtp={(value) => setOtp(value.replace(/[^0-9]/g, ""))}
        handleVerifyOtp={handleVerifyOtp}
        handleSendOtp={handleSendOtp}
        resetToLogin={resetToLogin}
        feedback={feedback}
        status={status}
      />
    );
  }

  if (route === "/home") {
    return null;
  }

  /* ------------------------------------------------------------------
     LOGIN UI
  ------------------------------------------------------------------ */
  return (
    <div className="login-container">
      <div className="logo-section">
        <div className="logo-circle">
          <img src={logo} alt="Nirvaana Yoga" />
        </div>
      </div>

      <div className="welcome-section">
        <h2 className="welcome-title">Welcome</h2>
        <p className="welcome-subtitle">Enter your mobile number to continue</p>
      </div>

      <div className="input-box">
        <div className="input-row">
          <div className="country-input">
            <label className="input-label" htmlFor="login-country">Country</label>
            <select
              id="login-country"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="country-select"
            >
              <option value="+91">+91</option>
              <option value="+1">+1</option>
              <option value="+44">+44</option>
              <option value="+61">+61</option>
            </select>
          </div>

          <div className="mobile-input-container">
            <label className="input-label" htmlFor="login-mobile">Mobile number</label>
            <input
              id="login-mobile"
              type="tel"
              placeholder="Your mobile number"
              value={mobile}
              onChange={handleMobileChange}
              className="mobile-input"
              maxLength={10}
              inputMode="numeric"
            />
          </div>
        </div>

        <button
          type="button"
          className={`otp-button${!isValidMobile || status === "loading" ? " disabled" : ""}`}
          disabled={!isValidMobile || status === "loading"}
          onClick={handleSendOtp}
        >
          {status === "loading" ? "Sending..." : "Send OTP"}
        </button>

        {feedback && (
          <p className={`login-feedback ${status === "error" ? "login-feedback--error" : "login-feedback--success" }`}>{feedback}</p>
        )}

        <div className="divider"><span>Or</span></div>

        <div className="social-buttons">
          <button className="social-btn google" type="button" onClick={handleGoogleLogin}>Login with Google</button>
          <button className="social-btn apple" type="button" onClick={handleLinkedInLogin}>Login with LinkedIn</button>
          {/* <button className="social-btn apple">Login with Apple</button>
          <button className="social-btn facebook">Login with Facebook</button> */}
        </div>

        <p className="create-account">
          Don't have an account yet?{" "} 
          <button type="button" className="create-link">Create Account</button>
        </p>
      </div>
    </div>
  );
};
