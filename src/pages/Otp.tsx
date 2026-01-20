import React from 'react';
import '../styles/Otp.css';

interface OtpProps {
  otp: string;
  setOtp: (otp: string) => void;
  handleVerifyOtp: (event: React.FormEvent<HTMLFormElement>) => void;
  handleSendOtp: () => void;
  resetToLogin: () => void;
  feedback: string;
  status: 'idle' | 'loading' | 'success' | 'error';
}

export const Otp: React.FC<OtpProps> = ({ otp, setOtp, handleVerifyOtp, handleSendOtp, resetToLogin, feedback, status }) => {

  const handleOtpChange = (index: number, value: string) => {
    const newOtp = otp.split('');
    newOtp[index] = value.replace(/[^0-9]/g, '');
    setOtp(newOtp.join(''));

    // Auto-focus to the next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <>
      <button type="button" className="back-button-top" onClick={resetToLogin}>
      </button>
      <div className="login-container">
        <div className="login-content">

          <div className="welcome-section">
            <h2 className="welcome-title"> Account Confirmation </h2>
            <p className="otp-description-text"> Enter the OTP sent to your mobile to complete your login.</p>
          </div>

          <form className="otp-box" onSubmit={handleVerifyOtp}>
            <div className="otp-input-fields">
              {[0, 1, 2, 3].map((index) => (
                <input
                  key={index}
                  id={`otp-input-${index}`}
                  type="tel"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  value={otp[index] || ''}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !otp[index] && index > 0) {
                      document.getElementById(`otp-input-${index - 1}`)?.focus();
                    }
                  }}
                  className="otp-single-input"
                />
              ))}
            </div>

            <button 
              type="submit" 
              className={`otp-submit${status === 'loading' ? ' disabled' : ''}`}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Verifying...' : 'Verify OTP'}
            </button>

            <p className="otp-resend-text">
              Haven’t received the OTP yet?
              <button type="button" onClick={handleSendOtp}>
                Resend OTP
              </button>
            </p>

            {feedback && (
              <p
                className={`login-feedback${
                  status === 'error' ? ' login-feedback--error' : ' login-feedback--success'
                }`}
                role="status"
              >
                {feedback}
              </p>
            )}
          </form>

        </div>
      </div>
    </>
  );
};
