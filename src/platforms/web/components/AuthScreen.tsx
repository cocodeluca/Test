import React, { useState } from 'react';
import { Apple, Chrome, Home, Lock, Mail, UserCircle2 } from 'lucide-react';
import type { AppLanguage } from '../../../common/types/settings';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonPrimaryClass,
  appButtonMutedClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface AuthScreenProps {
  onLogin: (payload: { email: string; password: string }) => Promise<void> | void;
  onRegister: (payload: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void> | void;
  onSocialAuth: (provider: 'google' | 'apple' | 'microsoft') => Promise<void> | void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onRegister,
  onSocialAuth,
}) => {
  const { settings, updateSettings, t } = useSettings();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialLoadingProvider, setSocialLoadingProvider] = useState<
    'google' | 'apple' | 'microsoft' | null
  >(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        await onRegister({
          name,
          email,
          password,
        });
      } else {
        await onLogin({ email, password });
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'apple' | 'microsoft') => {
    setError(null);
    setSocialLoadingProvider(provider);

    try {
      await onSocialAuth(provider);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t('auth.social.unavailable')
      );
    } finally {
      setSocialLoadingProvider(null);
    }
  };

  const handleDemoMode = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await onLogin({
        email: 'admin',
        password: 'admin',
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const socialProviders: Array<{
    id: 'google' | 'apple' | 'microsoft';
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'google',
      label: t('auth.social.google'),
      icon: <Chrome className="h-4.5 w-4.5" />,
    },
    {
      id: 'apple',
      label: t('auth.social.apple'),
      icon: <Apple className="h-4.5 w-4.5" />,
    },
    {
      id: 'microsoft',
      label: t('auth.social.microsoft'),
      icon: (
        <span className="grid h-4.5 w-4.5 grid-cols-2 gap-[2px]">
          <span className="rounded-[2px] bg-current" />
          <span className="rounded-[2px] bg-current" />
          <span className="rounded-[2px] bg-current" />
          <span className="rounded-[2px] bg-current" />
        </span>
      ),
    },
  ];

  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: 'en', label: t('settings.options.english') },
    { value: 'es', label: t('settings.options.spanish') },
    { value: 'pt', label: t('settings.options.portuguese') },
  ];

  return (
    <div className="min-h-screen bg-[var(--app-shell-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <section className={`${appPanelClass} flex flex-col justify-between rounded-[32px] p-6 sm:p-8`}>
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sky-600 dark:text-sky-300">
              <Home className="h-4.5 w-4.5" />
              <span className="text-sm font-semibold">RE Portfolio</span>
            </div>
            <h1 className={`mt-6 text-3xl font-bold tracking-tight sm:text-5xl ${appTextStrongClass}`}>
              {t('auth.heroTitle')}
            </h1>
            <p className={`mt-4 max-w-2xl text-base leading-7 ${appTextMutedClass}`}>
              {t('auth.heroBody')}
            </p>
          </div>
          <div className={`mt-8 grid gap-4 sm:grid-cols-3 ${appTextMutedClass}`}>
            <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('auth.highlights.fastEntryTitle')}</p>
              <p className="mt-2 text-sm">{t('auth.highlights.fastEntryBody')}</p>
            </div>
            <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('auth.highlights.starterWorkspaceTitle')}</p>
              <p className="mt-2 text-sm">{t('auth.highlights.starterWorkspaceBody')}</p>
            </div>
            <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('auth.highlights.guidedLaterTitle')}</p>
              <p className="mt-2 text-sm">{t('auth.highlights.guidedLaterBody')}</p>
            </div>
          </div>
        </section>

        <section className={`${appPanelClass} rounded-[32px] p-6 sm:p-8`}>
          <div className={`${appPanelInsetClass} mb-6 rounded-2xl p-3`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
              {t('settings.fields.language')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSettings({ language: option.value })}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    settings.language === option.value
                      ? `${appButtonPrimaryClass} shadow-[0_14px_28px_-20px_rgba(15,23,42,0.3)]`
                      : `${appButtonMutedClass} ${appTextMutedClass}`
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mode === 'register'
                  ? appButtonPrimaryClass
                  : `${appButtonMutedClass} ${appTextMutedClass}`
              }`}
            >
              {t('auth.createAccountTab')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mode === 'login'
                  ? appButtonPrimaryClass
                  : `${appButtonMutedClass} ${appTextMutedClass}`
              }`}
            >
              {t('auth.loginTab')}
            </button>
          </div>

          <div className="mt-6">
            <h2 className={`text-2xl font-semibold ${appTextStrongClass}`}>
              {mode === 'register' ? t('auth.createTitle') : t('auth.welcomeBack')}
            </h2>
            <p className={`mt-2 text-sm ${appTextMutedClass}`}>
              {mode === 'register'
                ? t('auth.createDescription')
                : t('auth.loginDescription')}
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => void handleSocialAuth(provider.id)}
                disabled={isSubmitting || socialLoadingProvider !== null}
                className={`flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${appButtonMutedClass} ${appTextStrongClass}`}
              >
                <span className="text-slate-700 dark:text-slate-200">{provider.icon}</span>
                <span>
                  {socialLoadingProvider === provider.id
                    ? t('auth.social.loading')
                    : provider.label}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800" />
            <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>
              {t('auth.orContinueWithEmail')}
            </span>
            <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800" />
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <label className="block">
                <span className={`mb-2 flex items-center gap-2 text-sm font-medium ${appTextMutedClass}`}>
                  <UserCircle2 className="h-4 w-4" />
                  {t('auth.name')}
                </span>
                <input
                  className={`w-full ${appInputClass}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  required
                />
              </label>
            ) : null}

            <label className="block">
              <span className={`mb-2 flex items-center gap-2 text-sm font-medium ${appTextMutedClass}`}>
                <Mail className="h-4 w-4" />
                {t('auth.email')}
              </span>
              <input
                type="email"
                className={`w-full ${appInputClass}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
              />
            </label>

            <label className="block">
              <span className={`mb-2 flex items-center gap-2 text-sm font-medium ${appTextMutedClass}`}>
                <Lock className="h-4 w-4" />
                {t('auth.password')}
              </span>
              <input
                type="password"
                className={`w-full ${appInputClass}`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                required
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || socialLoadingProvider !== null}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold ${appButtonPrimaryClass} disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {isSubmitting
                ? t('auth.saving')
                : mode === 'register'
                ? t('auth.createAction')
                : t('auth.loginAction')}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void handleDemoMode()}
            disabled={isSubmitting || socialLoadingProvider !== null}
            className={`mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold ${appButtonMutedClass} ${appTextStrongClass} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            Try demo account
          </button>

          <p className={`mt-4 text-xs leading-5 ${appTextSoftClass}`}>
            {t('auth.emailLoginHelp')}
          </p>
        </section>
      </div>
    </div>
  );
};
