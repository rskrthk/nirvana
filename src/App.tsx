import { useEffect, useState, type ReactElement } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';
import './App.css';
import Carousel from './components/Carousel';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Home } from './pages/Home'; // Import Home component
import { FreeContent } from './pages/FreeContent';
import { FreeGuidedYoga } from './pages/FreeGuidedYoga';
import { Meditation } from './pages/Meditation';
import { PersonalisedYoga } from './pages/PersonalisedYoga';
import { PersonalisedDetails } from './pages/PersonalisedDetails';
import { PersonalisedAsanaPlan } from './pages/PersonalisedAsanaPlan';
import { SESSION_TIMESTAMP_KEY } from './constants';

const LOGIN_PATH = '/login';
const OTP_PATH = '/otp';
const HOME_PATH = '/home'; // Define HOME_PATH
const FREE_CONTENT_PATH = '/free-content';
const FREE_GUIDED_YOGA_PATH = '/free-guided-yoga';
const MEDITATION_PATH = '/meditation';
const PERSONALISED_YOGA_PATH = '/personalised-yoga';
const PERSONALISED_DETAILS_PATH = '/personalised-details';
const PERSONALISED_ASANA_PLAN_PATH = '/personalised-asana-plan';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

const NAVBAR_PATHS = new Set([
  FREE_CONTENT_PATH,
  FREE_GUIDED_YOGA_PATH,
  MEDITATION_PATH,
  PERSONALISED_YOGA_PATH,
  PERSONALISED_ASANA_PLAN_PATH,
]);

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname); // Track current path

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const [{ value: token }, { value: loggedAt }] = await Promise.all([
          Preferences.get({ key: 'accessToken' }),
          Preferences.get({ key: SESSION_TIMESTAMP_KEY }),
        ]);

        if (token && loggedAt) {
          const lastLogin = Number(loggedAt);
          if (!Number.isNaN(lastLogin) && Date.now() - lastLogin < SESSION_DURATION_MS) {
            window.history.replaceState(null, '', HOME_PATH);
            if (active) {
              setCurrentPath(HOME_PATH);
            }
            return;
          }
        }

        await Preferences.remove({ key: 'accessToken' });
        await Preferences.remove({ key: 'userInfo' });
        await Preferences.remove({ key: SESSION_TIMESTAMP_KEY });
      } catch (error) {
        console.warn('Unable to verify saved session', error);
      }
    };

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const enterImmersiveMode = async () => {
      try {
        await StatusBar.hide();
      } catch (error) {
        console.warn('Unable to hide status bar', error);
      } finally {
        // Ensure the splash never lingers once the React tree mounts
        SplashScreen.hide().catch((error) => {
          console.warn('Unable to hide splash screen', error);
        });
      }
    };

    void enterImmersiveMode();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname); // Update currentPath on popstate
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const originalPushState = window.history.pushState;
    window.history.pushState = (...args) => {
      originalPushState.apply(window.history, args);
      window.dispatchEvent(new Event('popstate')); // Dispatch popstate event
    };

    return () => {
      window.history.pushState = originalPushState; // Clean up on unmount
    };
  }, []); // Empty dependency array ensures it runs once

  // This useEffect now depends on currentPath
  useEffect(() => {
    const className = 'App--locked';
    if (currentPath === LOGIN_PATH || currentPath === OTP_PATH) { // Check currentPath for login
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }

    return () => {
      document.body.classList.remove(className);
    };
  }, [currentPath]); // Dependency on currentPath

  

  let currentPage: ReactElement | null = null;

  if (currentPath === HOME_PATH) {
    currentPage = <Home />;
  } else if (currentPath === FREE_CONTENT_PATH) {
    currentPage = <FreeContent />;
  } else if (currentPath === FREE_GUIDED_YOGA_PATH) {
    currentPage = <FreeGuidedYoga />;
  } else if (currentPath === MEDITATION_PATH) {
    currentPage = <Meditation />;
  } else if (currentPath === PERSONALISED_YOGA_PATH) {
    currentPage = <PersonalisedYoga />;
  } else if (currentPath === PERSONALISED_DETAILS_PATH) {
    currentPage = <PersonalisedDetails />;
  } else if (currentPath === PERSONALISED_ASANA_PLAN_PATH) {
    currentPage = <PersonalisedAsanaPlan />;
  }

  const shouldShowNavbar = NAVBAR_PATHS.has(currentPath);

  if (currentPage) {
    return (
      <>
        <div className={shouldShowNavbar ? 'page-with-navbar' : undefined}>
          {currentPage}
        </div>
        {shouldShowNavbar && <Navbar />}
      </>
    );
  }

  return (
    <div className="App">
      <Carousel onContinue={() => window.history.pushState(null, '', LOGIN_PATH)} /> {/* Navigate to login */}
      { (currentPath === LOGIN_PATH || currentPath === OTP_PATH) && ( // Render login overlay if currentPath is login
        <div className="App__overlay" role="dialog" aria-modal="true">
          <Login />
        </div>
      )}
    </div>
  );
}

export default App;
