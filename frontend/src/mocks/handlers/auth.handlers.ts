import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";

const MOCK_USER = {
  id: "user-001",
  fullName: "Aayush Kumar",
  email: "aayush@gmail.com",
  businessName: "Nova Living",
  businessType: "d2c_brand",
  teamSize: "6-20",
  city: "Mumbai, Maharashtra",
  role: "owner",
};

const MOCK_ACCESS_TOKEN = "mock-access-token-dev";

export const authHandlers = [
  // Sign up
  http.post(ENDPOINTS.AUTH_SIGNUP, async () => {
    await delay(800);
    return HttpResponse.json({
      data: {
        accessToken: MOCK_ACCESS_TOKEN,
        user: MOCK_USER,
        onboardingComplete: false,
      },
    });
  }),

  // Sign in
  http.post(ENDPOINTS.AUTH_SIGNIN, async () => {
    await delay(600);
    return HttpResponse.json({
      data: {
        accessToken: MOCK_ACCESS_TOKEN,
        user: MOCK_USER,
        onboardingComplete: true,
      },
    });
  }),

  // Current user
  http.get(ENDPOINTS.ME, async () => {
    await delay(200);
    return HttpResponse.json({ data: MOCK_USER });
  }),

  // Token refresh
  http.post(ENDPOINTS.AUTH_REFRESH, async () => {
    await delay(300);
    return HttpResponse.json({
      data: { accessToken: MOCK_ACCESS_TOKEN },
    });
  }),

  // Sign out
  http.post(ENDPOINTS.AUTH_SIGNOUT, async () => {
    await delay(200);
    return HttpResponse.json({ data: { success: true } });
  }),

  // Onboarding
  http.get(ENDPOINTS.ONBOARDING, async () => {
    await delay(300);
    return HttpResponse.json({
      data: {
        currentStep: "business",
        completedSteps: ["account"],
        businessName: "Nova Living",
        businessType: "d2c_brand",
      },
    });
  }),

  http.put(ENDPOINTS.ONBOARDING, async () => {
    await delay(400);
    return HttpResponse.json({ data: { success: true } });
  }),
];
