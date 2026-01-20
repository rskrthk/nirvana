import React from 'react';
import '../styles/Navbar.css';
import { SettingsIcon } from '../icons/SettingsIcon';
import { ProgressIcon } from '../icons/ProgressIcon';
import { GoalsIcon } from '../icons/GoalsIcon';
import { HomeIcon } from '../icons/HomeIcon';

export const Navbar: React.FC = () => {
  return (
    <div className="navbar-container">
      <button className="navbar-item">
        <SettingsIcon />
        <span>Settings</span>
      </button>
      <button className="navbar-item">
        <ProgressIcon />
        <span>Progress</span>
      </button>
      <button className="navbar-item">
        <GoalsIcon />
        <span>My goals</span>
      </button>
      <button className="navbar-item" onClick={() => window.history.pushState(null, '', '/home')}>
        <HomeIcon />
        <span>Home</span>
      </button>
    </div>
  );
};
