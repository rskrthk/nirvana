import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import "../styles/PersonalisedDetails.css";
import { API_ROOT, EXTERNAL_ONLINE_USER_UPDATE, } from "../constants";
import { LeftIcon } from "../icons/LeftIcon";
import { Modal } from "../components/Modal";
import SuccessSplashImage from "../assets/Splash screen (2).png";
import { isNativeRuntime } from "../utils/platform";
import { extractImageFromPayload, fetchAndCacheAsanaPlan, fetchEnumGroup, fileToBase64, generateAndCacheAsanaPlan, parseResponseData } from "../utils/utils";
import { FormState, ReviewSection } from "./interface";
import { BASE_TOTAL_STEPS, HEALTH_CONFIRMATION_LIMIT, MONTH_SELECT_OPTIONS, NO_SLEEP_PATTERN_OPTION, NO_SURGERY_OPTION, NO_SYMPTOM_OPTION } from "../utils/constants";

export const PersonalisedDetails: React.FC = () => {
  const [formData, setFormData] = useState<FormState>({
    firstName: "",
    lastName: "",
    countryCode: "+91",
    mobile: "",
    email: "",
    gender: "",
    age: "",
    day: "",
    month: "",
    year: "",
    city: "",
    state: "",
    country: "",
    currentHealth: [],
    healthNotes: "",
    mostWorriedSymptoms: [],
    yogaGoals: [],
    yogaGoalNotes: "", // New
    surgeries: [],
    surgeryNotes: "",
    familyHistory: [],
    familyNotes: "",
    familyMembers: [],
    stressLevel: "",
    physicalMetricsNotes: "", // New
    sleepPattern: "",
    nightRoutineNotes: "", // New
    yogaExperience: "",
    mealType: "",
    stayType: "",
    lifestyleNotes: "", // New
  });

  const [initialFormData, setInitialFormData] = useState<FormState | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [reviewEditStep, setReviewEditStep] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isSuccessSplashVisible, setIsSuccessSplashVisible] = useState(false);
  const [navigationDetails, setNavigationDetails] = useState<{ url: string; state: any } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [symptomOptions, setSymptomOptions] = useState<string[]>([]);
  const [isLoadingSymptoms, setIsLoadingSymptoms] = useState(false);
  const [symptomFetchError, setSymptomFetchError] = useState<string | null>(null);
  const [surgeryOptions, setSurgeryOptions] = useState<string[]>([]);
  const [isLoadingSurgeries, setIsLoadingSurgeries] = useState(false);
  const [surgeryFetchError, setSurgeryFetchError] = useState<string | null>(null);
  const [familyHistoryOptions, setFamilyHistoryOptions] = useState<string[]>([]);
  const [isLoadingFamilyHistory, setIsLoadingFamilyHistory] = useState(false);
  const [familyHistoryFetchError, setFamilyHistoryFetchError] = useState<string | null>(null);
  const [stressLevelOptions, setStressLevelOptions] = useState<string[]>([]);
  const [isLoadingStressLevels, setIsLoadingStressLevels] = useState(false);
  const [stressLevelFetchError, setStressLevelFetchError] = useState<string | null>(null);
  const [yogaGoalOptions, setYogaGoalOptions] = useState<string[]>([]);
  const [isLoadingYogaGoals, setIsLoadingYogaGoals] = useState(false);
  const [yogaGoalFetchError, setYogaGoalFetchError] = useState<string | null>(null);
  const [sleepPatternOptions, setSleepPatternOptions] = useState<string[]>([]);
  const [isLoadingSleepPatterns, setIsLoadingSleepPatterns] = useState(false);
  const [sleepPatternFetchError, setSleepPatternFetchError] = useState<string | null>(null);
  const [yogaExperienceOptions, setYogaExperienceOptions] = useState<string[]>([]);
  const [isLoadingYogaExperience, setIsLoadingYogaExperience] = useState(false);
  const [yogaExperienceFetchError, setYogaExperienceFetchError] = useState<string | null>(null);
  const [mealTypeOptions, setMealTypeOptions] = useState<string[]>([]);
  const [isLoadingMealTypes, setIsLoadingMealTypes] = useState(false);
  const [mealTypeFetchError, setMealTypeFetchError] = useState<string | null>(null);
  const [stayTypeOptions, setStayTypeOptions] = useState<string[]>([]);
  const [isLoadingStayTypes, setIsLoadingStayTypes] = useState(false);
  const [stayTypeFetchError, setStayTypeFetchError] = useState<string | null>(null);
  const [genderOptions, setGenderOptions] = useState<string[]>([]);
  const [isLoadingGenders, setIsLoadingGenders] = useState(false);
  const [genderFetchError, setGenderFetchError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [existingUserId, setExistingUserId] = useState<number | null>(null);
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [hasBackendProfileImage, setHasBackendProfileImage] = useState(false);
  const [healthConfirmationSelectedSymptoms, setHealthConfirmationSelectedSymptoms] = useState<string[]>([]);
  const [healthConfirmationSelectedSurgeries, setHealthConfirmationSelectedSurgeries] = useState<string[]>([]);
  const [mostBotheredSelected, setMostBotheredSelected] = useState<string[]>([]);
  const [mostBotheredOriginStep, setMostBotheredOriginStep] = useState<number | null>(null);
  const [confirmedSymptomHash, setConfirmedSymptomHash] = useState("");
  const [confirmedSurgeryHash, setConfirmedSurgeryHash] = useState("");
  const [hasAutoNavigatedToSummary, setHasAutoNavigatedToSummary] = useState(false);
  const editBaselineSignature = useRef<string | null>(null);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [hasCompleteExistingProfile, setHasCompleteExistingProfile] = useState(false);
  const skipHealthConfirmation = useRef(false);
  const computeSelectionHash = (items: string[]) => items.filter((item) => Boolean(item)).sort().join("|");
  const [isMobileLogin, setIsMobileLogin] = useState(false)
  const isUpdateMode = Boolean(existingUserId);
  // const { value:ismobileNumberPresent } = await Preferences.get({ key: 'MobileNumber' })
  const [userId, setUserId] = useState<string | null>(null); // to hide the start page for the personal plan to the existed user
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);

  const loadProfileImage = useCallback(
    async (userId: number, token?: string) => {
      if (!userId) return;
      const url = `${API_ROOT}/api/v1/users/profile-image/${userId}`;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        if (isNativeRuntime()) {
          const res = await CapacitorHttp.get({
            url,
            headers: Object.keys(headers).length ? headers : undefined,
          });
          const normalized = extractImageFromPayload(res.data);
          if (normalized) {
            setImagePreview(normalized);
          }
          return;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) return;
        const text = await response.text();
        const normalized = extractImageFromPayload(text);
        if (normalized) {
          setImagePreview(normalized);
        }
      } catch (error) {
        console.warn("Unable to load profile image:", error);
      }
    },
    []
  );

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        formData,
        imagePreview,
        hasBackendProfileImage,
        selectedFileBase64,
      }),
    [formData, imagePreview, hasBackendProfileImage, selectedFileBase64]
  );

  useEffect(() => {
    if (reviewEditStep !== null && editBaselineSignature.current === null) {
      editBaselineSignature.current = currentSignature;
      return;
    }
    if (reviewEditStep === null && editBaselineSignature.current !== null) {
      editBaselineSignature.current = null;
    }
  }, [currentSignature, reviewEditStep]);

  const handleGoToExistingPlan = useCallback(() => {
    if (!existingUserId) return;
    window.history.pushState(null, "", `/personalised-asana-plan?userId=${existingUserId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [existingUserId]);

  useEffect(() => {
    setIsModalOpen(true);
  }, [loadProfileImage]);


  useEffect(() => {
    const symptomController = new AbortController();
    const surgeryController = new AbortController();
    const familyHistoryController = new AbortController();
    const yogaGoalController = new AbortController();
    const stressLevelController = new AbortController();
    const sleepPatternController = new AbortController();
    const yogaExperienceController = new AbortController();
    const mealTypeController = new AbortController();
    const stayTypeController = new AbortController();
    const genderController = new AbortController();

    const fetchYogaGoalOptions = async () => {
      setIsLoadingYogaGoals(true);
      setYogaGoalFetchError(null);

      try {
        const options = await fetchEnumGroup("Yoga Goals", yogaGoalController.signal);
        setYogaGoalOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load yoga goals", error);
        setYogaGoalFetchError("We couldn't load yoga goals. Please try again shortly.");
      } finally {
        setIsLoadingYogaGoals(false);
      }
    };

    const fetchSymptomOptions = async () => {
      setIsLoadingSymptoms(true);
      setSymptomFetchError(null);

      try {
        const options = await fetchEnumGroup("Symptoms", symptomController.signal);
        const finalOptions = options.includes(NO_SYMPTOM_OPTION)
          ? options
          : [...options, NO_SYMPTOM_OPTION];
        setSymptomOptions(finalOptions);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load symptom options", error);
        setSymptomFetchError("We couldn't load symptom options. Please try again shortly.");
      } finally {
        setIsLoadingSymptoms(false);
      }
    };

    const fetchSurgeryOptions = async () => {
      setIsLoadingSurgeries(true);
      setSurgeryFetchError(null);

      try {
        const options = await fetchEnumGroup("Surgeries", surgeryController.signal);
        const finalOptions = options.includes(NO_SURGERY_OPTION)
          ? options
          : [...options, NO_SURGERY_OPTION];
        setSurgeryOptions(finalOptions);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load surgery options", error);
        setSurgeryFetchError("We couldn't load medical history options. Please try again shortly.");
      } finally {
        setIsLoadingSurgeries(false);
      }
    };

    const fetchFamilyHistoryOptions = async () => {
      setIsLoadingFamilyHistory(true);
      setFamilyHistoryFetchError(null);

      try {
        const options = await fetchEnumGroup("Hereditary", familyHistoryController.signal);
        setFamilyHistoryOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load family history options", error);
        setFamilyHistoryFetchError("We couldn't load family health history. Please try again shortly.");
      } finally {
        setIsLoadingFamilyHistory(false);
      }
    };

    const fetchStressLevelOptions = async () => {
      setIsLoadingStressLevels(true);
      setStressLevelFetchError(null);

      try {
        const options = await fetchEnumGroup("Stress Level", stressLevelController.signal);
        setStressLevelOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load stress level options", error);
        setStressLevelFetchError("We couldn't load stress levels. Please try again shortly.");
      } finally {
        setIsLoadingStressLevels(false);
      }
    };

    const fetchSleepPatternOptions = async () => {
      setIsLoadingSleepPatterns(true);
      setSleepPatternFetchError(null);

      try {
        const options = await fetchEnumGroup("Sleep Patterns", sleepPatternController.signal);
        const finalOptions = options.includes(NO_SLEEP_PATTERN_OPTION)
          ? options
          : [...options, NO_SLEEP_PATTERN_OPTION];
        setSleepPatternOptions(finalOptions);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load sleep pattern options", error);
        setSleepPatternFetchError("We couldn't load night routine options. Please try again shortly.");
      } finally {
        setIsLoadingSleepPatterns(false);
      }
    };

    const fetchYogaExperienceOptions = async () => {
      setIsLoadingYogaExperience(true);
      setYogaExperienceFetchError(null);

      try {
        const options = await fetchEnumGroup("Experience Level", yogaExperienceController.signal);
        setYogaExperienceOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load yoga experience options", error);
        setYogaExperienceFetchError("We couldn't load yoga experience options. Please try again shortly.");
      } finally {
        setIsLoadingYogaExperience(false);
      }
    };

    const fetchMealTypeOptions = async () => {
      setIsLoadingMealTypes(true);
      setMealTypeFetchError(null);

      try {
        const options = await fetchEnumGroup("Meal Type", mealTypeController.signal);
        setMealTypeOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load meal types", error);
        setMealTypeFetchError("We couldn't load meal types. Please try again shortly.");
      } finally {
        setIsLoadingMealTypes(false);
      }
    };

    const fetchStayTypeOptions = async () => {
      setIsLoadingStayTypes(true);
      setStayTypeFetchError(null);

      try {
        const options = await fetchEnumGroup("Stay Type", stayTypeController.signal);
        setStayTypeOptions(options);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load stay types", error);
        setStayTypeFetchError("We couldn't load stay types. Please try again shortly.");
      } finally {
        setIsLoadingStayTypes(false);
      }
    };

    const fetchGenderOptions = async () => {
      setIsLoadingGenders(true);
      setGenderFetchError(null);

      try {
        const options = await fetchEnumGroup("Gender", genderController.signal);
        setGenderOptions(options.length ? options : ["Male", "Female"]);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Unable to load gender options", error);
        setGenderOptions(["Male", "Female"]);
        setGenderFetchError("We couldn't load gender options. Please try again shortly.");
      } finally {
        setIsLoadingGenders(false);
      }
    };

    fetchYogaGoalOptions();
    fetchSymptomOptions();
    fetchSurgeryOptions();
    fetchFamilyHistoryOptions();
    fetchStressLevelOptions();
    fetchSleepPatternOptions();
    fetchYogaExperienceOptions();
    fetchMealTypeOptions();
    fetchStayTypeOptions();
    fetchGenderOptions();


    return () => {
      yogaGoalController.abort();
      symptomController.abort();
      surgeryController.abort();
      familyHistoryController.abort();
      stressLevelController.abort();
      sleepPatternController.abort();
      yogaExperienceController.abort();
      mealTypeController.abort();
      stayTypeController.abort();
      genderController.abort();
    };
  }, []);

  useEffect(() => {
    // Stop the global loader when all initial data has finished loading
    if (
      !isLoadingSymptoms &&
      !isLoadingSurgeries &&
      !isLoadingFamilyHistory &&
      !isLoadingStressLevels &&
      !isLoadingYogaGoals &&
      !isLoadingSleepPatterns &&
      !isLoadingYogaExperience &&
      !isLoadingMealTypes &&
      !isLoadingStayTypes &&
      !isLoadingGenders &&
      !isLoadingProfile
    ) {
      // Small delay to ensure "painted" state and avoid flickering
      const timer = setTimeout(() => {
        setIsInitialDataLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    isLoadingSymptoms,
    isLoadingSurgeries,
    isLoadingFamilyHistory,
    isLoadingStressLevels,
    isLoadingYogaGoals,
    isLoadingSleepPatterns,
    isLoadingYogaExperience,
    isLoadingMealTypes,
    isLoadingStayTypes,
    isLoadingGenders,
    isLoadingProfile,
  ]);
  // Try to load an existing online user if we have an id saved in Preferences
  useEffect(() => {
    const loadExistingProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const { value: token } = await Preferences.get({ key: "accessToken" });
        const { value: storedId } = await Preferences.get({ key: "onlineUserId" });
        const { value: IsMobilelogin } = await Preferences.get({ key: "MobileNumber" })
        if (IsMobilelogin === "true") {
          setIsMobileLogin(true)
        }
        // Also support the userInfo object persisted in Preferences (JSON string)
        let id: number | null = null;
        if (storedId) {
          const parsed = Number(storedId);
          if (Number.isFinite(parsed)) id = parsed;
        }

        if (!id) {
          const { value: userInfoJson } = await Preferences.get({ key: "userInfo" });
          if (userInfoJson) {
            try {
              const ui = JSON.parse(userInfoJson) as any;
              if (ui && (ui.id || ui.userId || ui._id)) {
                id = Number(ui.id || ui.userId || ui._id) || null;
                // prefill mobile if available
                if (ui.mobileNumber && !formData.mobile) {
                  setFormData((prev) => ({ ...prev, mobile: String(ui.mobileNumber) }));
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        if (!token || !id) return;

        const url = `${EXTERNAL_ONLINE_USER_UPDATE}/${id}`;
        let status = 0;
        let raw: any = null;

        if (isNativeRuntime()) {
          const res = await CapacitorHttp.get({ url, headers: { Authorization: `Bearer ${token}` } });
          status = res.status;
          raw = res.data;
        } else {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          status = res.status;
          raw = await res.text();
        }

        const parsed = parseResponseData(raw);
        if (status >= 200 && status < 300 && parsed && typeof parsed === "object") {
          const data = parsed as any;
          setExistingUserId(Number(data.id) || id);

          const normalizeString = (value: unknown) =>
            typeof value === "string" ? value.trim() : "";
          const hasMobile =
            data.mobileNumber !== undefined &&
            data.mobileNumber !== null &&
            String(data.mobileNumber).trim().length > 0;
          const hasCompletePersonalDetails =
            Boolean(normalizeString(data.name)) &&
            Boolean(normalizeString(data.lastName)) &&
            Boolean(normalizeString(data.email)) &&
            hasMobile &&
            Boolean(normalizeString(data.gender)) &&
            Boolean(normalizeString(data.city)) &&
            Boolean(normalizeString(data.state)) &&
            Boolean(normalizeString(data.countryName));
          setHasCompleteExistingProfile(hasCompletePersonalDetails);

          const fetchedAgeValue =
            data.age !== undefined && data.age !== null ? String(data.age) : "";
          const normalizedDay =
            data.day !== undefined && data.day !== null ? String(data.day) : "";
          const normalizedMonth =
            data.month !== undefined && data.month !== null ? String(data.month) : "";
          const normalizedYear =
            data.year !== undefined && data.year !== null ? String(data.year) : "";
          const needsDerivedDob =
            Boolean(fetchedAgeValue) &&
            (!normalizedDay || !normalizedMonth || !normalizedYear);
          const derivedDobFromAge = needsDerivedDob
            ? deriveDobFromAge(fetchedAgeValue)
            : {
              day: normalizedDay,
              month: normalizedMonth,
              year: normalizedYear,
            };

          const nextDay =
            normalizedDay || (needsDerivedDob ? derivedDobFromAge.day : formData.day);
          const nextMonth =
            normalizedMonth || (needsDerivedDob ? derivedDobFromAge.month : formData.month);
          const nextYear =
            normalizedYear || (needsDerivedDob ? derivedDobFromAge.year : formData.year);

          const nextFormData = {
            ...formData,
            firstName: data.name || formData.firstName,
            lastName: data.lastName || formData.lastName,
            email: data.email || formData.email,
            mobile: data.mobileNumber ? String(data.mobileNumber) : formData.mobile,
            countryCode: data.countryCode || formData.countryCode,
            gender: data.gender || formData.gender,
            age: fetchedAgeValue || formData.age,
            day: nextDay,
            month: nextMonth,
            year: nextYear,
            city: data.city || formData.city,
            state: data.state || formData.state,
            country: data.countryName || formData.country,
            yogaGoals: Array.isArray(data.yogaGoals) ? data.yogaGoals : formData.yogaGoals,
            currentHealth: Array.isArray(data.symptoms) ? data.symptoms : formData.currentHealth,
            surgeries: Array.isArray(data.surgeries) ? data.surgeries : formData.surgeries,
            familyHistory: Array.isArray(data.healthHistory) ? data.healthHistory : formData.familyHistory,
            stressLevel: data.stressLevel || formData.stressLevel,
            yogaExperience: data.level || formData.yogaExperience,
            mealType: data.mealType || formData.mealType,
            stayType: data.stayType || formData.stayType,
            sleepPattern: data.sleepPattern || formData.sleepPattern,
            healthNotes: data.healthNotes || formData.healthNotes,
            mostWorriedSymptoms: Array.isArray(data.mostWorriedSymptoms)
              ? data.mostWorriedSymptoms
              : formData.mostWorriedSymptoms,
          };

          setFormData(nextFormData);
          setInitialFormData(nextFormData);

          const savedMostWorried = Array.isArray(data.mostWorriedSymptoms)
            ? data.mostWorriedSymptoms
            : [];
          setConfirmedSymptomHash(computeSelectionHash(savedMostWorried));
          setConfirmedSurgeryHash(computeSelectionHash(savedMostWorried));

          setHasBackendProfileImage(Boolean(data.hasProfileImage));

          const imageFromPrimaryResponse = extractImageFromPayload(parsed);
          if (imageFromPrimaryResponse) {
            setImagePreview(imageFromPrimaryResponse);
          }

          await loadProfileImage(id, token);
          setHasLoadedProfile(true);
        }
      } catch (err) {
        // silently ignore profile load errors; user can continue to create
        console.warn("Could not load existing profile:", err);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadExistingProfile();
  }, []);

  const validatePersonalInfo = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    // if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
    // if (!selectedFile && !imagePreview && !hasBackendProfileImage)
    //   newErrors.image = "Profile picture is required";
    if (!formData.mobile.trim()) newErrors.mobile = "Mobile number is required";
    // if (!formData.email.trim()) newErrors.email = "Email is required";
    // if (!formData.gender) newErrors.gender = "Gender is required";
    // if (!formData.age && (!formData.day || !formData.month || !formData.year)) {
    //   newErrors.age = "Please enter your age or date of birth.";
    // }
    // if (!formData.city.trim()) newErrors.city = "City is required";
    // if (!formData.state.trim()) newErrors.state = "State is required";
    // if (!formData.country) newErrors.country = "Country is required";
    return newErrors;
  };


  const validateYogaGoals = () => {
    const newErrors: Record<string, string> = {};
    if (formData.yogaGoals.length === 0) {
      newErrors.yogaGoals = "Select at least one personal goal.";
    }
    return newErrors;
  };

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  };

  function deriveDobFromAge(rawAge: string) {
    const parsedAge = Number(rawAge);
    if (!rawAge || !Number.isFinite(parsedAge) || parsedAge <= 0) {
      return { day: "", month: "", year: "" };
    }
    const wholeAge = Math.floor(parsedAge);
    const currentYear = new Date().getFullYear();
    const computedYear = Math.max(1900, currentYear - wholeAge);
    return { day: "", month: "", year: `${computedYear}` };
  }

  function deriveAgeFromDob(day: string, month: string, year: string) {
    if (!day || !month || !year) {
      return "";
    }
    const dayNum = Number(day);
    const monthNum = Number(month);
    const yearNum = Number(year);
    if (
      ![dayNum, monthNum, yearNum].every((num) => Number.isFinite(num)) ||
      monthNum < 1 ||
      monthNum > 12 ||
      dayNum < 1 ||
      dayNum > 31
    ) {
      return "";
    }
    const dob = new Date(yearNum, monthNum - 1, dayNum);
    if (Number.isNaN(dob.getTime())) {
      return "";
    }
    const today = new Date();
    let computedAge = today.getFullYear() - yearNum;
    const birthdayHasOccurred =
      today.getMonth() + 1 > monthNum ||
      (today.getMonth() + 1 === monthNum && today.getDate() >= dayNum);
    if (!birthdayHasOccurred) {
      computedAge -= 1;
    }
    return computedAge >= 0 ? `${computedAge}` : "";
  }

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const age = e.target.value;
    const derivedDob = deriveDobFromAge(age);
    setFormData((prev) => ({
      ...prev,
      age,
      ...derivedDob,
    }));
    clearFieldError("age");
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const isDobField = name === "day" || name === "month" || name === "year";
    setFormData((prev) => {
      const nextState = {
        ...prev,
        [name]: value,
      };
      if (isDobField) {
        const nextDay = name === "day" ? value : prev.day;
        const nextMonth = name === "month" ? value : prev.month;
        const nextYear = name === "year" ? value : prev.year;
        const derivedAge = deriveAgeFromDob(nextDay, nextMonth, nextYear);
        return {
          ...nextState,
          age: derivedAge,
          day: nextDay,
          month: nextMonth,
          year: nextYear,
        };
      }
      return nextState;
    });
    clearFieldError(name);
    if (isDobField) {
      clearFieldError("age");
    }
  };

  const handleGenderSelect = (gender: string) => {
    setFormData((prev) => ({ ...prev, gender }));
    clearFieldError("gender");
  };

  const handleYogaGoalToggle = (value: string) => {
    setFormData((prev) => {
      const hasValue = prev.yogaGoals.includes(value);
      const updated = hasValue
        ? prev.yogaGoals.filter((item) => item !== value)
        : [...prev.yogaGoals, value];

      return { ...prev, yogaGoals: updated };
    });
    clearFieldError("yogaGoals");
  };

  const handleSymptomToggle = (value: string) => {
    setFormData((prev) => {
      const hasValue = prev.currentHealth.includes(value);
      let updated: string[];

      if (value === NO_SYMPTOM_OPTION) {
        updated = hasValue ? [] : [NO_SYMPTOM_OPTION];
      } else if (hasValue) {
        updated = prev.currentHealth.filter((item) => item !== value);
      } else {
        updated = [...prev.currentHealth.filter((item) => item !== NO_SYMPTOM_OPTION), value];
      }

      return { ...prev, currentHealth: updated };
    });
    clearFieldError("currentHealth");
    setConfirmedSymptomHash("");
  };

  const handleSurgeryToggle = (value: string) => {
    setFormData((prev) => {
      const hasValue = prev.surgeries.includes(value);
      let updated: string[];

      if (value === NO_SURGERY_OPTION) {
        updated = hasValue ? [] : [NO_SURGERY_OPTION];
      } else if (hasValue) {
        updated = prev.surgeries.filter((item) => item !== value);
      } else {
        updated = [...prev.surgeries.filter((item) => item !== NO_SURGERY_OPTION), value];
      }

      return { ...prev, surgeries: updated };
    });
    clearFieldError("surgeries");
    setConfirmedSurgeryHash("");
  };

  const handleFamilyHistoryToggle = (value: string) => {
    setFormData((prev) => {
      const hasValue = prev.familyHistory.includes(value);
      const updated = hasValue
        ? prev.familyHistory.filter((item) => item !== value)
        : [...prev.familyHistory, value];

      return {
        ...prev,
        familyHistory: updated,
        familyMembers: updated.length === 0 ? [] : prev.familyMembers,
      };
    });
    clearFieldError("familyHistory");
  };

  const handleStressLevelSelect = (level: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      stressLevel: checked ? level : prev.stressLevel === level ? "" : prev.stressLevel,
    }));
    clearFieldError("stressLevel");
  };

  const handleSleepPatternCheckbox = (pattern: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      sleepPattern: checked ? pattern : prev.sleepPattern === pattern ? "" : prev.sleepPattern,
    }));
    clearFieldError("sleepPattern");
  };

  const handleYogaExperienceSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      yogaExperience: prev.yogaExperience === value ? "" : value,
    }));
    clearFieldError("yogaExperience");
  };

  const handleMealTypeSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      mealType: prev.mealType === value ? "" : value,
    }));
    clearFieldError("mealType");
  };

  const handleStayTypeSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      stayType: prev.stayType === value ? "" : value,
    }));
    clearFieldError("stayType");
  };

  const resetHealthConfirmationSelections = () => {
    setHealthConfirmationSelectedSymptoms([]);
    setHealthConfirmationSelectedSurgeries([]);
    clearFieldError("healthConfirmation");
  };

  const handleHealthConfirmationSymptomToggle = (value: string) => {
    setHealthConfirmationSelectedSymptoms((prev) => {
      const hasValue = prev.includes(value);
      if (hasValue) {
        return prev.filter((item) => item !== value);
      }
      if (prev.length >= HEALTH_CONFIRMATION_LIMIT) {
        return prev;
      }
      return [...prev, value];
    });
    clearFieldError("healthConfirmation");
  };

  const handleHealthConfirmationSurgeryToggle = (value: string) => {
    setHealthConfirmationSelectedSurgeries((prev) => {
      const hasValue = prev.includes(value);
      if (hasValue) {
        return prev.filter((item) => item !== value);
      }
      if (prev.length >= HEALTH_CONFIRMATION_LIMIT) {
        return prev;
      }
      return [...prev, value];
    });
    clearFieldError("healthConfirmation");
  };

  const handleMostBotheredToggle = (value: string) => {
    setMostBotheredSelected((prev) => {
      const hasValue = prev.includes(value);
      if (hasValue) {
        return prev.filter((item) => item !== value);
      }
      if (prev.length >= HEALTH_CONFIRMATION_LIMIT) {
        return prev; // prevent selecting more than limit without auto replacement
      }
      return [...prev, value];
    });
    clearFieldError("mostBotheredConfirmation");
  };

  const selectedSymptoms = useMemo(
    () => formData.currentHealth.filter((item) => item && item !== NO_SYMPTOM_OPTION),
    [formData.currentHealth]
  );

  const selectedSurgeries = useMemo(
    () => formData.surgeries.filter((item) => item && item !== NO_SURGERY_OPTION),
    [formData.surgeries]
  );

  const sanitizeMostBotheredItems = (items?: string[]) =>
    (items || [])
      .map((item) => item?.trim())
      .filter(
        (item): item is string =>
          Boolean(item) && item !== NO_SYMPTOM_OPTION && item !== NO_SURGERY_OPTION
      );

  const unionMostBotheredSelections = (...lists: readonly string[][]) => {
    const merged = new Set<string>();
    lists.forEach((list) => {
      list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
  };

  const clampMostBotheredSelections = (items: string[]) =>
    items.slice(0, HEALTH_CONFIRMATION_LIMIT);

  const isSymptomConfirmationPending = useMemo(() => {
    const hash = computeSelectionHash(selectedSymptoms);
    return (
      selectedSymptoms.length > HEALTH_CONFIRMATION_LIMIT &&
      hash !== confirmedSymptomHash
    );
  }, [selectedSymptoms, confirmedSymptomHash]);

  const isSurgeryConfirmationPending = useMemo(() => {
    const hash = computeSelectionHash(selectedSurgeries);
    return (
      selectedSurgeries.length > HEALTH_CONFIRMATION_LIMIT &&
      hash !== confirmedSurgeryHash
    );
  }, [selectedSurgeries, confirmedSurgeryHash]);

  const mostBotheredSymptomsToShow = useMemo(() => {
    const saved = Array.isArray(formData.mostWorriedSymptoms)
      ? formData.mostWorriedSymptoms.filter((opt) => symptomOptions.includes(opt))
      : [];
    return Array.from(new Set([...selectedSymptoms, ...saved]));
  }, [formData.mostWorriedSymptoms, selectedSymptoms, symptomOptions]);

  const mostBotheredSurgeriesToShow = useMemo(() => {
    const saved = Array.isArray(formData.mostWorriedSymptoms)
      ? formData.mostWorriedSymptoms.filter((opt) => surgeryOptions.includes(opt))
      : [];
    return Array.from(new Set([...selectedSurgeries, ...saved]));
  }, [formData.mostWorriedSymptoms, selectedSurgeries, surgeryOptions]);

  const confirmedMostBotheredSymptoms = useMemo(() => {
    return (formData.mostWorriedSymptoms || []).filter((opt) => symptomOptions.includes(opt));
  }, [formData.mostWorriedSymptoms, symptomOptions]);

  const confirmedMostBotheredSurgeries = useMemo(() => {
    return (formData.mostWorriedSymptoms || []).filter((opt) => surgeryOptions.includes(opt));
  }, [formData.mostWorriedSymptoms, surgeryOptions]);

  const shouldForceMostBotheredBeforeSummary = useMemo(
    () => !hasCompleteExistingProfile && (isSymptomConfirmationPending || isSurgeryConfirmationPending),
    [hasCompleteExistingProfile, isSymptomConfirmationPending, isSurgeryConfirmationPending]
  );

  const needsHealthConfirmationStep =
    (isSymptomConfirmationPending || isSurgeryConfirmationPending) &&
    !shouldForceMostBotheredBeforeSummary;

  const hasMostBotheredChanges = useMemo(() => {
    if (currentStep !== 999) {
      return false;
    }

    const saved = (formData.mostWorriedSymptoms || []).map((value) => value?.trim()).filter(Boolean);
    const selected = mostBotheredSelected.map((value) => value?.trim()).filter(Boolean);
    if (saved.length !== selected.length) {
      return true;
    }

    const savedSet = new Set(saved);
    return selected.some((value) => !savedSet.has(value));
  }, [currentStep, formData.mostWorriedSymptoms, mostBotheredSelected]);

  const totalSteps = needsHealthConfirmationStep ? BASE_TOTAL_STEPS + 1 : BASE_TOTAL_STEPS;
  const summaryStep = totalSteps;
  const healthConfirmationStepNumber = needsHealthConfirmationStep ? totalSteps - 1 : null;
  const isHealthConfirmationStepActive =
    healthConfirmationStepNumber !== null && currentStep === healthConfirmationStepNumber;
  const isHealthConfirmationNextDisabled =
    isHealthConfirmationStepActive &&
    ((isSymptomConfirmationPending &&
      healthConfirmationSelectedSymptoms.length !== HEALTH_CONFIRMATION_LIMIT) ||
      (isSurgeryConfirmationPending &&
        healthConfirmationSelectedSurgeries.length !== HEALTH_CONFIRMATION_LIMIT));

  const wasHealthConfirmationStepActive = useRef(false);
  useEffect(() => {
    if (isHealthConfirmationStepActive) {
      wasHealthConfirmationStepActive.current = true;
      if (
        isSymptomConfirmationPending &&
        healthConfirmationSelectedSymptoms.length === 0
      ) {
        setHealthConfirmationSelectedSymptoms(
          selectedSymptoms.slice(0, HEALTH_CONFIRMATION_LIMIT)
        );
      }
      if (
        isSurgeryConfirmationPending &&
        healthConfirmationSelectedSurgeries.length === 0
      ) {
        setHealthConfirmationSelectedSurgeries(
          selectedSurgeries.slice(0, HEALTH_CONFIRMATION_LIMIT)
        );
      }
      return;
    }
    if (wasHealthConfirmationStepActive.current) {
      wasHealthConfirmationStepActive.current = false;
      resetHealthConfirmationSelections();
    }
  }, [
    healthConfirmationSelectedSymptoms.length,
    healthConfirmationSelectedSurgeries.length,
    isHealthConfirmationStepActive,
    isSurgeryConfirmationPending,
    isSymptomConfirmationPending,
    selectedSurgeries,
    selectedSymptoms,
  ]);


  const navigateToSummary = useCallback(
    (originStep: number | null = mostBotheredOriginStep) => {
      if (originStep !== null) {
        setCurrentStep(999);
        return;
      }
      setCurrentStep(summaryStep);
    },
    [mostBotheredOriginStep, summaryStep]
  );

  useEffect(() => {
    if (
      !shouldForceMostBotheredBeforeSummary ||
      healthConfirmationStepNumber === null ||
      currentStep !== healthConfirmationStepNumber
    ) {
      return;
    }

    navigateToSummary();
  }, [
    currentStep,
    healthConfirmationStepNumber,
    navigateToSummary,
    shouldForceMostBotheredBeforeSummary,
    summaryStep,
  ]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      // For preview (Data URL)
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      try {
        // For native upload via CapacitorHttp (base64 without data: prefix)
        const base64 = await fileToBase64(file);
        setSelectedFileBase64(base64);
      } catch (err) {
        console.warn("Failed to convert file to base64:", err);
        setSelectedFileBase64(null);
      }

      // Clear any previous image validation error
      clearFieldError("image");
    }
  };

  const handlePreviousStep = () => {
    if (reviewEditStep !== null && reviewEditStep === currentStep) {
      setReviewEditStep(null);
      navigateToSummary(null);
      setErrors({});
      return;
    }
    setCurrentStep((prev) => Math.max(1, prev - 1));
    setErrors({});
  };

  const goToReviewOrStep = (nextStep: number) => {
    if (healthConfirmationStepNumber !== null && nextStep === healthConfirmationStepNumber) {
      resetHealthConfirmationSelections();
    }
    if (reviewEditStep !== null && reviewEditStep === currentStep) {
      setReviewEditStep(null);
      navigateToSummary(null);
      return;
    }

    if (nextStep === summaryStep) {
      navigateToSummary();
      return;
    }

    setCurrentStep(nextStep);
  };

  useEffect(() => {
    if (currentStep > summaryStep && currentStep !== 999) {
      navigateToSummary();
    }
  }, [currentStep, summaryStep, navigateToSummary]);

  useEffect(() => {
    if (
      hasAutoNavigatedToSummary ||
      isLoadingProfile ||
      !existingUserId ||
      !hasLoadedProfile ||
      !hasCompleteExistingProfile ||
      currentStep !== 1 ||
      reviewEditStep !== null
    ) {
      return;
    }

    setErrors({});
    navigateToSummary();
    setHasAutoNavigatedToSummary(true);
  }, [
    currentStep,
    existingUserId,
    hasAutoNavigatedToSummary,
    hasCompleteExistingProfile,
    hasLoadedProfile,
    isLoadingProfile,
    reviewEditStep,
    summaryStep,
    navigateToSummary,
  ]);

  useEffect(() => {
    if (!isSuccessSplashVisible || !navigationDetails) {
      return;
    }

    const timer = setTimeout(() => {
      window.history.pushState(navigationDetails.state, "", navigationDetails.url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 2000); // Use 2 seconds for a better UX

    return () => clearTimeout(timer);
  }, [isSuccessSplashVisible, navigationDetails]);


  useEffect(() => {
    const loadUserId = async () => {
      const result = await Preferences.get({ key: "userInfo" });
      setUserId(result.value);
    };

    loadUserId();
  }, []);
  useEffect(() => {
    if (userId && hasLoadedProfile) {
      setIsLoadingSummary(false);
      setCurrentStep(9)
    } else {
      setIsLoadingSummary(false);
    }
  }, [userId, hasLoadedProfile]);

  const hasChanges = useMemo(() => {
    if (!initialFormData) return false;
    // Check if new image selected
    if (selectedFile) return true;

    // Check simple fields
    const simpleFields = [
      "firstName", "lastName", "countryCode", "mobile", "email", "gender",
      "age", "day", "month", "year", "city", "state", "country",
      "healthNotes", "yogaGoalNotes", "surgeryNotes", "familyNotes",
      "physicalMetricsNotes", "nightRoutineNotes", "lifestyleNotes",
      "stressLevel", "sleepPattern", "yogaExperience", "mealType", "stayType"
    ] as const;

    for (const field of simpleFields) {
      if (formData[field] !== initialFormData[field]) return true;
    }

    // Check array fields
    const arrayFields = [
      "currentHealth", "mostWorriedSymptoms", "yogaGoals",
      "surgeries", "familyHistory", "familyMembers"
    ] as const;

    for (const field of arrayFields) {
      const arr1 = formData[field] || [];
      const arr2 = initialFormData[field] || [];
      if (arr1.length !== arr2.length) return true;

      const set1 = new Set(arr1);
      for (const item of arr2) {
        if (!set1.has(item)) return true;
      }
    }

    return false;
  }, [formData, initialFormData, selectedFile]);

  const renderPrimaryButton = (defaultLabel = "Next", disabled = false) => {
    const isEditingThisStep = reviewEditStep === currentStep;
    const isFixedBottom = !isEditingThisStep && defaultLabel === "Next";

    return (
      <div className={`buttonRow ${isFixedBottom ? "fixed-bottom" : ""}`}>
        <button
          className={isEditingThisStep ? "updateButton" : "nextButton"}
          type="submit"
          disabled={disabled}
        >
          {isEditingThisStep ? "Go to summary" : defaultLabel}
        </button>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep === 1) {
      const personalErrors = validatePersonalInfo();
      if (Object.keys(personalErrors).length > 0) {
        setErrors(personalErrors);
        return;
      }

      setErrors({});
      goToReviewOrStep(2);
      return;
    }
    if (currentStep === 2) {
      const goalErrors = validateYogaGoals();
      if (Object.keys(goalErrors).length > 0) {
        setErrors(goalErrors);
        return;
      }

      setErrors({});
      goToReviewOrStep(3);
      return;
    }
    if (currentStep === 3) {
      setErrors({});

      // If user selected more than the allowed symptoms, ask them which are most bothered
      const savedMostBothered = sanitizeMostBotheredItems(formData.mostWorriedSymptoms);

      if (selectedSymptoms.length > HEALTH_CONFIRMATION_LIMIT) {
        // When editing this step from the summary, do not prefill with any
        // selections — start empty so the user can pick afresh. Otherwise,
        // prefill with previously saved most-bothered values.
        const prefillMost = reviewEditStep !== null && reviewEditStep === 3 ? [] : savedMostBothered;
        setMostBotheredSelected(prefillMost);
        setMostBotheredOriginStep(3);
        goToReviewOrStep(4);
        return;
      }

      goToReviewOrStep(4);
      return;
    }
    if (currentStep === 4) {
      // If user selected more than allowed surgeries, ask which bother most
      const surgeriesSelectedClean = formData.surgeries.filter(
        (item) => item && item !== NO_SURGERY_OPTION
      );
      const savedMostBothered = sanitizeMostBotheredItems(formData.mostWorriedSymptoms);
      if (surgeriesSelectedClean.length > HEALTH_CONFIRMATION_LIMIT) {
        const prefillMost = reviewEditStep !== null && reviewEditStep === 4 ? [] : savedMostBothered;
        setMostBotheredSelected(prefillMost);
        setMostBotheredOriginStep(4);
        goToReviewOrStep(5);
        return;
      }

      const editableSection = reviewEditStep !== null && reviewEditStep === currentStep;
      const updatedSurgeriesCount = formData.surgeries.filter(
        (item) => item && item !== NO_SURGERY_OPTION
      ).length;
      const hasTooManySurgeries = updatedSurgeriesCount > HEALTH_CONFIRMATION_LIMIT;

      if (
        editableSection &&
        hasTooManySurgeries &&
        healthConfirmationStepNumber !== null
      ) {
        setReviewEditStep(null);
        setCurrentStep(healthConfirmationStepNumber);
        return;
      }

      goToReviewOrStep(5);
      return;
    }

    if (currentStep === 5) {
      if (reviewEditStep !== null && reviewEditStep === currentStep) {
        skipHealthConfirmation.current = true;
      }

      goToReviewOrStep(6);
      return;
    }

    if (currentStep === 6) {
      goToReviewOrStep(7);
      return;
    }

    if (currentStep === 7) {
      goToReviewOrStep(8);
      return;
    }

    if (currentStep === 8) {
      setErrors({});
      const nextStep = healthConfirmationStepNumber ?? summaryStep;
      goToReviewOrStep(nextStep);
      return;
    }

    if (
      healthConfirmationStepNumber !== null &&
      currentStep === healthConfirmationStepNumber
    ) {
      const missingSelections: string[] = [];
      if (
        isSymptomConfirmationPending &&
        healthConfirmationSelectedSymptoms.length !== HEALTH_CONFIRMATION_LIMIT
      ) {
        missingSelections.push("symptoms");
      }
      if (
        isSurgeryConfirmationPending &&
        healthConfirmationSelectedSurgeries.length !== HEALTH_CONFIRMATION_LIMIT
      ) {
        missingSelections.push("injuries");
      }

      if (missingSelections.length > 0) {
        const message =
          missingSelections.length === 1
            ? `Select two ${missingSelections[0]} to continue.`
            : "Select two symptoms and two injuries to continue.";
        setErrors({
          healthConfirmation: message,
        });
        return;
      }

      setErrors({});
      setFormData((prev) => ({
        ...prev,
        currentHealth: isSymptomConfirmationPending
          ? healthConfirmationSelectedSymptoms
          : prev.currentHealth,
        surgeries: isSurgeryConfirmationPending
          ? healthConfirmationSelectedSurgeries
          : prev.surgeries,
      }));
      setReviewEditStep(null);
      goToReviewOrStep(summaryStep);
      return;
    }

    if (currentStep === 999) {
      // Make the most-bothered selection optional: user may choose any number (including none)
      setErrors({});
      // Persist whatever the user chose (may be empty)
      setFormData((prev) => ({
        ...prev,
        mostWorriedSymptoms: mostBotheredSelected,
      }));
      setMostBotheredSelected([]);

      const origin = mostBotheredOriginStep;
      setMostBotheredOriginStep(null);
      if (origin === 3) {
        setConfirmedSymptomHash(computeSelectionHash(selectedSymptoms));
      } else if (origin === 4) {
        setConfirmedSurgeryHash(computeSelectionHash(selectedSurgeries));
      }

      if (reviewEditStep !== null && reviewEditStep === origin) {
        setReviewEditStep(null);
      }
      navigateToSummary(null);

      return;
    }

    if (currentStep === summaryStep) {
      setErrors({});

      if (mostBotheredOriginStep !== null) {
        const savedMostBothered = sanitizeMostBotheredItems(formData.mostWorriedSymptoms);
        const combined = clampMostBotheredSelections(
          unionMostBotheredSelections(savedMostBothered, selectedSymptoms, selectedSurgeries)
        );
        const prefillMost =
          reviewEditStep !== null && reviewEditStep === mostBotheredOriginStep
            ? []
            : combined;
        setMostBotheredSelected(prefillMost);
        setErrors((prev) => {
          const { mostBotheredConfirmation, ...rest } = prev;
          return rest;
        });
        setCurrentStep(999);
        return;
      }

      const now = new Date();
      const subscribeDate = now.toISOString();
      const subscribeExpiry = new Date(now);
      subscribeExpiry.setFullYear(subscribeExpiry.getFullYear() + 1);

      const ageValue = formData.age.trim();
      const maybeAge = Number(ageValue);
      const age = ageValue && Number.isFinite(maybeAge) ? maybeAge : null;

      if (needsHealthConfirmationStep && healthConfirmationStepNumber !== null && hasMostBotheredChanges) {
        setCurrentStep(healthConfirmationStepNumber);
        return;
      }

      const mobileDigits = formData.mobile.replace(/\D/g, "");
      const mobileNumber = mobileDigits ? Number(mobileDigits) : null;

      const symptoms = formData.currentHealth.includes(NO_SYMPTOM_OPTION)
        ? []
        : formData.currentHealth;
      const surgeries = formData.surgeries.includes(NO_SURGERY_OPTION) ? [] : formData.surgeries;

      const otherNotes = [
        formData.healthNotes,
        formData.yogaGoalNotes,
        formData.surgeryNotes,
        formData.familyNotes,
        formData.physicalMetricsNotes,
        formData.nightRoutineNotes,
        formData.lifestyleNotes,
      ]
        .map((note) => note.trim())
        .filter(Boolean)
        .join(" | ");

      const payload = {
        name: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        state: formData.state.trim(),
        countryName: formData.country.trim(),
        email: formData.email.trim(),
        mobileNumber,
        countryCode: formData.countryCode.trim(),
        gender: formData.gender,
        age: age ?? null,
        level: formData.yogaExperience,
        healthNotes: formData.healthNotes.trim(),
        yogaGoals: formData.yogaGoals,
        symptoms,
        surgeries,
        healthHistory: formData.familyHistory,
        city: formData.city.trim(),
        mealType: formData.mealType,
        stayType: formData.stayType,
        stressLevel: formData.stressLevel,
        sleepPattern: formData.sleepPattern,
        otherNotes,
        subscribeDate,
        subscribeExpiryDate: subscribeExpiry.toISOString(),
        online: true,
        status: "ACTIVE",
        // Additional optional fields included in the sample request
        injuries: [],
        mostWorriedSymptoms: formData.mostWorriedSymptoms,
        language: "",
        availability: "",
        angerLevel: "",
        emailVerified: false,
        mobileVerified: isMobileLogin,
      };

      const formFieldName = "updated_user";

      // Determine target id: prefer in-memory existingUserId, then fall back to stored userInfo
      let targetId: number | null = existingUserId;
      if (!targetId) {
        const { value: userInfoJson } = await Preferences.get({ key: "userInfo" });
        if (userInfoJson) {
          try {
            const ui = JSON.parse(userInfoJson) as any;
            if (ui && (ui.id || ui.userId || ui._id)) {
              const parsed = Number(ui.id || ui.userId || ui._id);
              if (Number.isFinite(parsed)) targetId = parsed;
            }
          } catch {
            // ignore
          }
        }
      }

      if (!targetId) {
        throw new Error("User id not found. Please log in and try again.");
      }

      const requestUrl = `${EXTERNAL_ONLINE_USER_UPDATE}/${targetId}`;
      setIsSubmitting(true);
      try {
        const { value: token } = await Preferences.get({ key: "accessToken" });
        if (!token) {
          throw new Error("Authentication token not found. Please log in again.");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
        } as Record<string, string>;
        const imageName = selectedFile?.name || "profile.jpg";
        const imageType = selectedFile?.type || "image/jpeg";
        const base64ImageValue = selectedFileBase64 ?? (hasBackendProfileImage ? "" : "");

        let status = 0;
        let parsedBody: any = null;

        if (isNativeRuntime()) {
          // ---- Native runtime: use CapacitorHttp with proper multipart/form-data ----

          // Create boundary for multipart form data
          const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;

          // Build multipart body manually
          let body = '';

          // Add the updated_user JSON part
          body += `--${boundary}\r\n`;
          body += `Content-Disposition: form-data; name="${formFieldName}"\r\n`;
          body += `Content-Type: application/json\r\n\r\n`;
          body += JSON.stringify(payload) + '\r\n';

          // Add the image part (ALWAYS required by server)
          body += `--${boundary}\r\n`;
          body += `Content-Disposition: form-data; name="image"; filename="${imageName}"\r\n`;
          body += `Content-Type: ${imageType}\r\n`;

          if (base64ImageValue && base64ImageValue !== '') {
            // New image selected - send as base64
            body += `Content-Transfer-Encoding: base64\r\n\r\n`;
            body += base64ImageValue + '\r\n';
          } else {
            // No new image - send empty file
            body += `\r\n\r\n`;
          }

          // Close boundary
          body += `--${boundary}--\r\n`;

          const capRes = await CapacitorHttp.put({
            url: requestUrl,
            headers: {
              ...headers,
              'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            data: body
          });

          status = capRes.status;
          parsedBody = parseResponseData(capRes.data);
        }
        else {
          // ---- Web: use fetch + FormData as before ----
          const fd = new FormData();
          fd.append(
            formFieldName,
            new Blob([JSON.stringify(payload)], { type: "application/json" })
          );


          let imageFile: File;
          if (selectedFile) {
            imageFile = selectedFile;
          } else if (hasBackendProfileImage) {
            imageFile = new File([], "profile.jpg", { type: "image/jpeg" });
          } else {
            imageFile = new File([], "profile.jpg", { type: "image/jpeg" });
          }
          if (imageFile) {
            fd.append("image", imageFile, imageFile.name);
          }

          const response = await fetch(requestUrl, {
            method: "PUT",
            headers,
            body: fd,
          });

          status = response.status;
          const rawBody = await response.text();
          parsedBody = parseResponseData(rawBody);
        }

        // Common error handling (unchanged logic)
        if (status < 200 || status >= 300) {
          const message =
            (parsedBody &&
              typeof parsedBody === "object" &&
              "message" in parsedBody &&
              (parsedBody as { message?: string }).message) ||
            (typeof parsedBody === "string" && parsedBody.trim() ? parsedBody : null) ||
            `HTTP error! status: ${status}`;
          throw new Error(message);
        }


        let planData: unknown | null = null;
        try {
          planData = await fetchAndCacheAsanaPlan(targetId, token);
        } catch (getError) {
          console.warn("GET personalised plan failed, attempting to generate:", getError);
          await generateAndCacheAsanaPlan(targetId, token);
          try {
            planData = await fetchAndCacheAsanaPlan(targetId, token);
          } catch (planError) {
            console.error(
              "Unable to prefetch personalised asana plan after generation:",
              planError
            );
          }
        }

        const planNavigationState = planData ? { generatedPlan: planData } : null;
        const url = `/personalised-asana-plan?userId=${targetId}`;

        setNavigationDetails({ url, state: planNavigationState });
        setIsSuccessSplashVisible(true);
        return;
      } catch (error) {
        console.error("Error submitting form:", error);
        setErrors({ submit: (error as Error).message });
        alert("Failed to submit form: " + (error as Error).message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
  };

  const handleBackClick = () => {
    if (currentStep === 1) {
      window.history.pushState(null, "", "/home");
    } else {
      handlePreviousStep();
    }
  };

  const isYogaGoalSelected = (value: string) => formData.yogaGoals.includes(value);
  const isSymptomSelected = (value: string) => formData.currentHealth.includes(value);
  const isSurgerySelected = (value: string) => formData.surgeries.includes(value);
  const isStressLevelSelected = (value: string) => formData.stressLevel === value;
  const isFamilyHistorySelected = (value: string) => formData.familyHistory.includes(value);
  const isSleepPatternSelected = (value: string) => formData.sleepPattern === value;
  const isYogaExperienceSelected = (value: string) => formData.yogaExperience === value;
  const isMealTypeSelected = (value: string) => formData.mealType === value;
  const isStayTypeSelected = (value: string) => formData.stayType === value;

  const displayStep =
    currentStep === 999 && mostBotheredOriginStep ? mostBotheredOriginStep : currentStep;

  const formatValue = (value?: string | null) => {
    if (value === null || value === undefined) return null;
    const trimmed = value.toString().trim();
    return trimmed.length ? trimmed : null;
  };

  const formatPhoneNumber = () => {
    const phone = formData.mobile?.trim();
    if (!phone) return null;
    const code = formData.countryCode?.trim() || "";
    const combined = `${code} ${phone}`.trim();
    return combined.length ? combined : null;
  };

  const formatDateOfBirth = () => {
    const { day, month, year } = formData;
    if (!day || !month || !year) return null;
    return [day.trim(), month.trim(), year.trim()].join(" ");
  };


  const formatListItems = (items: string[], additional?: string) => {
    const cleaned = (items || [])
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item && item.length));
    if (additional) {
      const extra = additional.trim();
      if (extra) cleaned.push(extra);
    }
    return cleaned;
  };

  const reviewSections = useMemo<ReviewSection[]>( // personal info
    () => [
      {
        key: "personal-info",
        title: "Personal info",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 1,
        rows: [
          { label: "First name", value: formatValue(formData.firstName) },
          { label: "Last name", value: formatValue(formData.lastName) },
          { label: "Email", value: formatValue(formData.email) },
          { label: "Phone number", value: formatPhoneNumber() },
          { label: "Gender", value: formatValue(formData.gender) },
          { label: "Age", value: formatValue(formData.age) },
          { label: "Date of birth", value: formatDateOfBirth() },
          { label: "City", value: formatValue(formData.city) },
          { label: "State", value: formatValue(formData.state) },
          { label: "Country", value: formatValue(formData.country) },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
      {
        key: "personal-goal",
        title: "Your personal goal!",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 2,
        lists: [
          {
            label: "Your core intention",
            items: formatListItems(formData.yogaGoals),
          },
        ].filter((list) => list.items.length > 0),
        rows: [
          { label: "Goal notes", value: formatValue(formData.yogaGoalNotes) },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
      {
        key: "current-health",
        title: "Current health",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 3,
        lists: [
          {
            label: "Physical health",
            items: formatListItems(formData.currentHealth),
          },
        ].filter((list) => list.items.length > 0),
        rows: [{ label: "Health notes", value: formatValue(formData.healthNotes) }].filter(
          (row): row is { label: string; value: string } => Boolean(row.value)
        ),
      },
      {
        key: "medical-history",
        title: "Medical history",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 4,
        lists: [
          {
            label: "Surgeries & injuries",
            items: formatListItems(formData.surgeries),
          },
        ].filter((list) => list.items.length > 0),
        rows: [{ label: "Surgery notes", value: formatValue(formData.surgeryNotes) }].filter(
          (row): row is { label: string; value: string } => Boolean(row.value)
        ),
      },
      {
        key: "most-bothered",
        title: "Most bothered",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 999,
        lists: [
          {
            label: "Physical health",
            items: formatListItems(confirmedMostBotheredSymptoms),
          },
          {
            label: "Surgeries",
            items: formatListItems(confirmedMostBotheredSurgeries),
          },
        ].filter((list) => list.items.length > 0),
      },
      {
        key: "family-health",
        title: "Family health",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 5,
        lists: [
          {
            label: "Family history",
            items: formatListItems(formData.familyHistory),
          },
        ].filter((list) => list.items.length > 0),
        rows: [
          { label: "Family notes", value: formatValue(formData.familyNotes) },
          {
            label: "Family members",
            value: formatListItems(formData.familyMembers).join(", "),
          },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
      {
        key: "physical-metrics",
        title: "Physical metrics",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 6,
        rows: [
          { label: "Stress level", value: formatValue(formData.stressLevel) },
          {
            label: "Physical notes",
            value: formatValue(formData.physicalMetricsNotes),
          },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
      {
        key: "night-routine",
        title: "Night routine",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 7,
        rows: [
          { label: "Sleep pattern", value: formatValue(formData.sleepPattern) },
          { label: "Night routine notes", value: formatValue(formData.nightRoutineNotes) },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
      {
        key: "lifestyle",
        title: "Lifestyle & habits",
        description: "A few simple details will help Nirvaana craft sessions that truly fit you.",
        step: 8,
        rows: [
          { label: "Yoga experience", value: formatValue(formData.yogaExperience) },
          { label: "Meal type", value: formatValue(formData.mealType) },
          { label: "Stay type", value: formatValue(formData.stayType) },
          { label: "Lifestyle notes", value: formatValue(formData.lifestyleNotes) },
        ].filter((row): row is { label: string; value: string } => Boolean(row.value)),
      },
    ],
    [formData, mostBotheredSymptomsToShow, mostBotheredSurgeriesToShow]
  );

  const handleSummarySectionEdit = (step: number) => {
    setReviewEditStep(step);
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEditMostBothered = (originStep: number) => {
    // Open the special most-bothered confirmation page in edit mode.
    setReviewEditStep(originStep);
    setMostBotheredOriginStep(originStep);
    // prefill existing saved selections so user can adjust or clear them
    const savedSelections = clampMostBotheredSelections(
      sanitizeMostBotheredItems(formData.mostWorriedSymptoms)
    );
    const prefill = savedSelections.length
      ? savedSelections
      : []; // do not prefill when user cleared the list
    setMostBotheredSelected(prefill);
    setCurrentStep(999);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasReachedMostBotheredLimit = mostBotheredSelected.length >= HEALTH_CONFIRMATION_LIMIT;
  const isMostBotheredSelectable = (value: string) =>
    mostBotheredSelected.includes(value) || !hasReachedMostBotheredLimit;

  const renderSuccessSplash = () => (
    <div className="fullscreen-splash">
      <img src={SuccessSplashImage} alt="Nirvaana Yoga" />
    </div>
  );

  if (isSuccessSplashVisible) {
    return renderSuccessSplash();
  }

  if (isInitialDataLoading) {
    return (
      <div className="loader-overlay">
        <div className="loader-spinner"></div>
        <p className="loader-text">Sculpting your yoga experience...</p>
      </div>
    );
  }

  return (
    <div className="personalFormContainer">
      <header className="header">
        <button
          type="button"
          className="backButton"
          onClick={handleBackClick}
          aria-label={currentStep === 1 ? "Back to home" : "Go to previous step"}
        >
          <LeftIcon />
        </button>
        <div className="headerContent">
          <h2 className="brand">Nirva<span className="span-element">a</span>na Yoga</h2>
        </div>
      </header>
      <div className="progress-bar-wrapper">
        <p className="step">
          {currentStep} of {totalSteps}
        </p>
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>
      </div>

      <form className="formBox" onSubmit={handleSubmit}>
        {isLoadingSummary && <p> Loading Summary...</p>}
        {currentStep === 1 && (
          <>
            <h3 className="formTitle">Personal info</h3>
            <p className="formSubtitle">
              Your journey with Nirvaana begins here. Share a few details about yourself so we can craft yoga sessions that truly fit your body , mind and lifestyle .
            </p>

            <div className="formField profile-picture-container">
              <label htmlFor="image">
                <div className="profile-picture-placeholder">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Profile Preview" className="profile-picture" />
                  ) : (
                    <span>+</span>
                  )}
                </div>
                {/* Profile picture <span className="required-asterisk">*</span> */}
              </label>
              <input
                id="image"
                type="file"
                name="image"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
                required={false}
                tabIndex={currentStep === 1 ? 0 : -1}
              />
              {errors.image && <p className="error-message">{errors.image}</p>}
            </div>

            <div className="formField">
              <label htmlFor="firstName">First name <span className="required-asterisk">*</span></label>
              <input
                id="firstName"
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Your first name"
                autoComplete="given-name"
                className={errors.firstName ? "error" : ""}
              />
              {errors.firstName && <p className="error-message">{errors.firstName}</p>}
            </div>

            <div className="formField">
              <label htmlFor="lastName">Last name </label>
              <input
                id="lastName"
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Your last name"
                autoComplete="family-name"
                className={errors.lastName ? "error" : ""}
              />
              {errors.lastName && <p className="error-message">{errors.lastName}</p>}
            </div>

            <div className="inlineFields">
              <div className="formField">
                <label htmlFor="countryCode">Country </label>
                <select
                  id="countryCode"
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleChange}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>
              </div>
              <div className="formField">
                <label htmlFor="mobile">Mobile number <span className="required-asterisk">*</span></label>
                <input
                  id="mobile"
                  type="tel"
                  name="mobile"
                  disabled={isMobileLogin}
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="9999999999"
                  maxLength={10}
                  autoComplete="tel-national"
                  className={errors.mobile ? "error" : ""}
                />
                {errors.mobile && <p className="error-message">{errors.mobile}</p>}
              </div>
            </div>

            <div className="formField">
              <label htmlFor="email">Email </label>
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="yourmailid@email.com"
                autoComplete="email"
                className={errors.email ? "error" : ""}
              />
              {errors.email && <p className="error-message">{errors.email}</p>}
            </div>

            <div className="formField">
              <label>Gender </label>
              {isLoadingGenders && <p className="helperText">Loading gender options...</p>}
              {genderFetchError && <p className="error-message">{genderFetchError}</p>}
              {!isLoadingGenders && !genderFetchError && genderOptions.length > 0 && (
                <div className="genderGroup">
                  {genderOptions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`genderBtn ${formData.gender === g ? "selected" : ""}`}
                      onClick={() => handleGenderSelect(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              {!isLoadingGenders && !genderFetchError && genderOptions.length === 0 && (
                <p className="helperText">No gender options available right now.</p>
              )}
              {errors.gender && <p className="error-message">{errors.gender}</p>}
            </div>

            <div className="formField">
              <label htmlFor="age">Age  </label>
              <input
                id="age"
                type="number"
                name="age"
                value={formData.age}
                onChange={handleAgeChange}
                placeholder="Your age"
                className={errors.age ? "error" : ""}
              />
            </div>

            <div className="formField">
              <label>Date of birth</label>
              <div className="inlineFields">
                <select
                  name="day"
                  id="day"
                  value={formData.day}
                  onChange={handleChange}
                  className={errors.age ? "error" : ""}
                >
                  <option value="">Day</option>
                  {[...Array(31)].map((_, i) => {
                    const value = `${i + 1}`.padStart(2, "0");
                    return (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    );
                  })}
                </select>
                <select
                  name="month"
                  id="month"
                  value={formData.month}
                  onChange={handleChange}
                  className={errors.age ? "error" : ""}
                >
                  <option value="">Month</option>
                  {MONTH_SELECT_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <select
                  name="year"
                  id="year"
                  value={formData.year}
                  onChange={handleChange}
                  className={errors.age ? "error" : ""}
                >
                  <option value="">Year</option>
                  {Array.from({ length: 60 }, (_, i) => 2025 - i).map((y) => (
                    <option key={y} value={`${y}`}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              {errors.age && (
                <p className="error-message">{errors.age}</p>
              )}
            </div>

            <div className="formField">
              <label htmlFor="city">City</label>
              <input
                id="city"
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Bangalore"
                autoComplete="address-level2"
                className={errors.city ? "error" : ""}
              />
              {errors.city && <p className="error-message">{errors.city}</p>}
            </div>

            <div className="formField">
              <label htmlFor="state">State </label>
              <input
                id="state"
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="Karnataka"
                autoComplete="address-level1"
                className={errors.state ? "error" : ""}
              />
              {errors.state && <p className="error-message">{errors.state}</p>}
            </div>

            <div className="formField">
              <label htmlFor="country">Country </label>
              <select
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className={errors.country ? "error" : ""}
              >
                <option value="">Select</option>
                <option value="India">India</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
              </select>
              {errors.country && <p className="error-message">{errors.country}</p>}
            </div>



            {renderPrimaryButton()}
          </>
        )}

        {currentStep === 2 && (
          <>
            <h3 className="formTitle">Your Personal goal!</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Your goals <span className="required-asterisk">*</span></label>
              {isLoadingYogaGoals && <p className="helperText">Loading goals...</p>}
              {yogaGoalFetchError && <p className="error-message">{yogaGoalFetchError}</p>}
              {!isLoadingYogaGoals && !yogaGoalFetchError && (
                <div className="healthOptionsList">
                  {yogaGoalOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption ${isYogaGoalSelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="yogaGoals"
                        value={option}
                        checked={isYogaGoalSelected(option)}
                        onChange={() => handleYogaGoalToggle(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>

              )}
              {errors.yogaGoals && <p className="error-message">{errors.yogaGoals}</p>}
            </div>
            {renderPrimaryButton()}
          </>
        )}

        {currentStep === 3 && (
          <>
            <h3 className="formTitle">Current Health </h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Physical health </label>
              {isLoadingSymptoms && <p className="helperText">Loading symptom options...</p>}
              {symptomFetchError && <p className="error-message">{symptomFetchError}</p>}
              {!isLoadingSymptoms && !symptomFetchError && (
                <div className="healthOptionsList">
                  {symptomOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption ${isSymptomSelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="currentHealth"
                        value={option}
                        checked={isSymptomSelected(option)}
                        onChange={() => handleSymptomToggle(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.currentHealth && <p className="error-message">{errors.currentHealth}</p>}
            </div>
            {renderPrimaryButton()}
          </>
        )}

        {currentStep === 4 && (
          <>
            <h3 className="formTitle">Medical history</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Surgeries & Injuries </label>
              {isLoadingSurgeries && <p className="helperText">Loading medical history options...</p>}
              {surgeryFetchError && <p className="error-message">{surgeryFetchError}</p>}
              {!isLoadingSurgeries && !surgeryFetchError && (
                <div className="healthOptionsList">
                  {surgeryOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption ${isSurgerySelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="surgeries"
                        value={option}
                        checked={isSurgerySelected(option)}
                        onChange={() => handleSurgeryToggle(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.surgeries && <p className="error-message">{errors.surgeries}</p>}
            </div>
            {renderPrimaryButton()}
          </>
        )}

        {currentStep === 5 && (
          <>
            <h3 className="formTitle">Family health history</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Hereditary Conditions </label>
              {isLoadingFamilyHistory && <p className="helperText">Loading family history options...</p>}
              {familyHistoryFetchError && <p className="error-message">{familyHistoryFetchError}</p>}
              {!isLoadingFamilyHistory && !familyHistoryFetchError && (
                <div className="healthOptionsList">
                  {familyHistoryOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption ${isFamilyHistorySelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="familyHistory"
                        value={option}
                        checked={isFamilyHistorySelected(option)}
                        onChange={() => handleFamilyHistoryToggle(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {!isLoadingFamilyHistory &&
                !familyHistoryFetchError &&
                familyHistoryOptions.length === 0 && (
                  <p className="helperText">No hereditary conditions available right now.</p>
                )}
              {!errors.familyHistory &&
                !isLoadingFamilyHistory &&
                !familyHistoryFetchError &&
                familyHistoryOptions.length > 0 && (
                  <p className="helperText"> </p>
                )}
              {errors.familyHistory && <p className="error-message">{errors.familyHistory}</p>}
            </div>
            {renderPrimaryButton()}
          </>
        )}

        {currentStep === 6 && (
          <>
            <h3 className="formTitle">Physical metrics</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Stress level </label>
              {isLoadingStressLevels && <p className="helperText">Loading stress levels...</p>}
              {stressLevelFetchError && <p className="error-message">{stressLevelFetchError}</p>}
              {!isLoadingStressLevels && !stressLevelFetchError && (
                <div className="healthOptionsList">
                  {stressLevelOptions.map((level) => (
                    <label
                      key={level}
                      className={`healthOption healthOption--radio ${isStressLevelSelected(level) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="stressLevel"
                        value={level}
                        checked={isStressLevelSelected(level)}
                        onChange={(event) => handleStressLevelSelect(level, event.target.checked)}
                      />
                      <span>{level}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.stressLevel && <p className="error-message">{errors.stressLevel}</p>}
            </div>
            {renderPrimaryButton()}
          </>

        )}

        {currentStep === 7 && (
          <>
            <h3 className="formTitle">Night routine</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label>How would you describe your current sleep pattern? <span className="required-asterisk">*</span></label>
              {isLoadingSleepPatterns && <p className="helperText">Loading night routine options...</p>}
              {sleepPatternFetchError && <p className="error-message">{sleepPatternFetchError}</p>}
              {!isLoadingSleepPatterns && !sleepPatternFetchError && (
                <div className="healthOptionsList">
                  {sleepPatternOptions.map((pattern) => (
                    <label
                      key={pattern}
                      className={`healthOption healthOption--radio ${isSleepPatternSelected(pattern) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="sleepPattern"
                        value={pattern}
                        checked={isSleepPatternSelected(pattern)}
                        onChange={(event) => handleSleepPatternCheckbox(pattern, event.target.checked)}
                      />
                      <span>{pattern}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.sleepPattern && <p className="error-message">{errors.sleepPattern}</p>}
              {!errors.sleepPattern && !isLoadingSleepPatterns && !sleepPatternFetchError && (
                <p className="helperText">
                </p>
              )}
            </div>
            {renderPrimaryButton()}

          </>
        )}

        {currentStep === 8 && (

          <>
            <h3 className="formTitle">Lifestyle and habits</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Your yoga experience </label>
              {isLoadingYogaExperience && <p className="helperText">Loading experience levels...</p>}
              {yogaExperienceFetchError && <p className="error-message">{yogaExperienceFetchError}</p>}
              {!isLoadingYogaExperience && !yogaExperienceFetchError && (
                <div className="healthOptionsList">
                  {yogaExperienceOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption healthOption--radio ${isYogaExperienceSelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="yogaExperience"
                        value={option}
                        checked={isYogaExperienceSelected(option)}
                        onChange={() => handleYogaExperienceSelect(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.yogaExperience && <p className="error-message">{errors.yogaExperience}</p>}
            </div>

            <div className="formField">
              <label className="label-head">Meal type</label>
              {isLoadingMealTypes && <p className="helperText">Loading meal types...</p>}
              {mealTypeFetchError && <p className="error-message">{mealTypeFetchError}</p>}
              {!isLoadingMealTypes && !mealTypeFetchError && (
                <div className="healthOptionsList">
                  {mealTypeOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption healthOption--radio ${isMealTypeSelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="mealType"
                        value={option}
                        checked={isMealTypeSelected(option)}
                        onChange={() => handleMealTypeSelect(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.mealType && <p className="error-message">{errors.mealType}</p>}
            </div>

            <div className="formField">
              <label className="label-head">Where do you stay? </label>
              {isLoadingStayTypes && <p className="helperText">Loading stay types...</p>}
              {stayTypeFetchError && <p className="error-message">{stayTypeFetchError}</p>}
              {!isLoadingStayTypes && !stayTypeFetchError && (
                <div className="healthOptionsList">
                  {stayTypeOptions.map((option) => (
                    <label
                      key={option}
                      className={`healthOption healthOption--radio ${isStayTypeSelected(option) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="stayType"
                        value={option}
                        checked={isStayTypeSelected(option)}
                        onChange={() => handleStayTypeSelect(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.stayType && <p className="error-message">{errors.stayType}</p>}
            </div>
            {renderPrimaryButton()}
          </>
        )}

        {needsHealthConfirmationStep &&
          healthConfirmationStepNumber !== null &&
          currentStep === healthConfirmationStepNumber && (
            <>
              <h3 className="formTitle">Please confirm your current health status/bothering</h3>
              <p className="formSubtitle">
                A simple confirmation will help Nirvaana craft sessions that truly fit you.
              </p>

              {isSymptomConfirmationPending && (
                <div className="formField">
                  <label className="label-head">
                    Symptoms <span className="required-asterisk">*</span>
                  </label>
                  <div className="healthOptionsList">
                    {selectedSymptoms.map((item) => (
                      <label
                        key={`confirm-symptom-${item}`}
                        className={`healthOption healthOption--radio ${healthConfirmationSelectedSymptoms.includes(item) ? "selected" : ""
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={healthConfirmationSelectedSymptoms.includes(item)}
                          onChange={() => handleHealthConfirmationSymptomToggle(item)}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                  <p className="helperText">Select exactly two symptoms to proceed.</p>
                </div>
              )}

              {isSurgeryConfirmationPending && (
                <div className="formField">
                  <label className="label-head">
                    Injuries & surgeries <span className="required-asterisk">*</span>
                  </label>
                  <div className="healthOptionsList">
                    {selectedSurgeries.map((item) => (
                      <label
                        key={`confirm-surgery-${item}`}
                        className={`healthOption healthOption--radio ${healthConfirmationSelectedSurgeries.includes(item) ? "selected" : ""
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={healthConfirmationSelectedSurgeries.includes(item)}
                          onChange={() => handleHealthConfirmationSurgeryToggle(item)}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                  <p className="helperText">Select exactly two injuries to proceed.</p>
                </div>
              )}

              <p className="helperText">
                Two... Accurate health information allows Nirvaana Yoga to design personalised sessions
                that align with your comfort and wellness goals.
              </p>

              {errors.healthConfirmation && (
                <p className="error-message">{errors.healthConfirmation}</p>
              )}

              {renderPrimaryButton("Next", isHealthConfirmationNextDisabled)}
            </>
          )}

        {currentStep === 999 && (
          <>
            <h3 className="formTitle">Please confirm your current health status/bothering</h3>
            <p className="formSubtitle">
              A few simple details will help Nirvaana craft sessions that truly fit you.
            </p>

            <div className="formField">
              <label className="label-head">Symptoms</label>
              {mostBotheredSymptomsToShow.length === 0 && (
                <p className="helperText">No symptom options available for confirmation.</p>
              )}
              <div className="healthOptionsList">
                {mostBotheredSymptomsToShow.map((item) => (
                  <label
                    key={`most-symptom-${item}`}
                    className={`healthOption ${mostBotheredSelected.includes(item) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={mostBotheredSelected.includes(item)}
                      disabled={!isMostBotheredSelectable(item)}
                      onChange={() => handleMostBotheredToggle(item)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="formField">
              <label className="label-head">Injuries</label>
              {mostBotheredSurgeriesToShow.length === 0 && (
                <p className="helperText">No injury options available for confirmation.</p>
              )}
              <div className="healthOptionsList">
                {mostBotheredSurgeriesToShow.map((item) => (
                  <label
                    key={`most-surgery-${item}`}
                    className={`healthOption ${mostBotheredSelected.includes(item) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={mostBotheredSelected.includes(item)}
                      disabled={!isMostBotheredSelectable(item)}
                      onChange={() => handleMostBotheredToggle(item)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="helperText warning">
              Two... Accurate health information allows Nirvaana Yoga to design personalised sessions
              that align with your fitness level, comfort, and wellness.
            </p>

            {hasReachedMostBotheredLimit && (
              <p className="helperText warning">
                You can select up to {HEALTH_CONFIRMATION_LIMIT} options in this step.
              </p>
            )}

            {errors.mostBotheredConfirmation && (
              <p className="error-message">
                {errors.mostBotheredConfirmation}
              </p>
            )}
            <div className="buttonRow fixedBottom">
              <button className="updateButton" type="submit">
                Go to summary
              </button>
            </div>
          </>
        )}

        {currentStep === summaryStep && (
          <>
            <div className="review-summary">
              <div className="review-summary__header">
                <p className="review-summary__step">
                  Step {currentStep} of {totalSteps}
                </p>
                <h3 className="review-summary__title">Summary</h3>
                <p className="review-summary__subtitle">
                  Take a quick look at your information before confirming — this helps us create the best experience for you.
                </p>
              </div>

              {reviewSections.map((section) => (
                <section className="review-section" key={section.key}>
                  <div className="review-section__header">
                    <div>
                      <h4>{section.title}</h4>
                      <p>{section.description}</p>
                    </div>
                    {typeof section.step === "number" && (
                      <button
                        type="button"
                        className="review-edit"
                        onClick={() =>
                          section.key === "most-bothered"
                            ? handleEditMostBothered(section.step ?? 999)
                            : handleSummarySectionEdit(section.step as number)
                        }
                      >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 16H3.425L13.2 6.225L11.775 4.8L2 14.575V16ZM0 18V13.75L13.2 0.575C13.4 0.391667 13.6208 0.25 13.8625 0.15C14.1042 0.05 14.3583 0 14.625 0C14.8917 0 15.15 0.05 15.4 0.15C15.65 0.25 15.8667 0.4 16.05 0.6L17.425 2C17.625 2.18333 17.7708 2.4 17.8625 2.65C17.9542 2.9 18 3.15 18 3.4C18 3.66667 17.9542 3.92083 17.8625 4.1625C17.7708 4.40417 17.625 4.625 17.425 4.825L4.25 18H0ZM12.475 5.525L11.775 4.8L13.2 6.225L12.475 5.525Z" fill="#FFAE00" />
                        </svg>
                        Edit
                      </button>
                    )}
                  </div>

                  {section.rows && (
                    <dl className="review-rows">
                      {section.rows.map((row) => (
                        <div className="review-row" key={`${section.key}-${row.label}`}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {section.lists &&
                    section.lists.map((list) => (
                      <div className="review-list" key={`${section.key}-${list.label}`}>
                        <p className="review-list__label">{list.label}</p>
                        <ul>
                          {list.items.map((item) => (
                            <li key={`${list.label}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </section>
              ))}
            </div>

            <div className="buttonRow">
              <button className="nextButton" type="submit" disabled={isSubmitting || (isUpdateMode && !hasChanges)}>
                {isSubmitting && <span className="buttonSpinner" aria-hidden="true"></span>}
                {isUpdateMode ? "Update Details" : "Submit"}
              </button>
            </div>
            {isUpdateMode && (
              <div className="buttonRow">
                <button
                  type="button"
                  className="nextButton"
                  onClick={handleGoToExistingPlan}
                  disabled={!existingUserId}
                >
                  Go for Existing Yoga Plan
                </button>
              </div>
            )}
          </>
        )}
      </form>
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={() => setIsModalOpen(false)}
        title="Take a moment for you "
      >
        <p>This easy 3-minute survey lets Nirvaana tailor every session to your needs.
          your answers stay private and help us to create your most mindful experience</p>
      </Modal>
    </div>
  );
};
