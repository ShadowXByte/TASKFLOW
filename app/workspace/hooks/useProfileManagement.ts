'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';

export function useProfileManagement() {
  const { update } = useSession();
  const [profileName, setProfileName] = useState("");
  const [profileDateOfBirth, setProfileDateOfBirth] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  
  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const saveProfile = useCallback(async () => {
    setProfileMessage("");
    setProfileLoading(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          dateOfBirth: profileDateOfBirth || null,
        }),
      });

      const payload = (await response.json()) as { message?: string; name?: string; dateOfBirth?: string | null };
      if (!response.ok) {
        setProfileMessage(payload.message || "Unable to update profile.");
        return;
      }

      // Update local state
      if (typeof payload.name === "string") {
        setProfileName(payload.name);
      }
      if (typeof payload.dateOfBirth === "string") {
        setProfileDateOfBirth(payload.dateOfBirth.slice(0, 10));
      } else if (payload.dateOfBirth === null) {
        setProfileDateOfBirth("");
      }

      // Refresh session to update name in UI
      void update({
        user: {
          name: typeof payload.name === "string" ? payload.name : null,
        },
      });

      setProfileMessage("Profile updated.");
    } catch {
      setProfileMessage("Unable to update profile.");
    } finally {
      setProfileLoading(false);
    }
  }, [profileName, profileDateOfBirth, update]);

  const changeEmail = useCallback(async () => {
    setEmailMessage("");
    setEmailLoading(true);
    try {
      const response = await fetch("/api/user/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmailInput, currentPassword: emailPassword }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setEmailMessage(payload.message || "Unable to update email.");
        return;
      }

      setEmailPassword("");
      setEmailMessage("Email updated. Please sign in again to refresh session data.");
    } catch {
      setEmailMessage("Unable to update email.");
    } finally {
      setEmailLoading(false);
    }
  }, [newEmailInput, emailPassword]);

  const changePassword = useCallback(async () => {
    setPasswordMessage("");
    setPasswordLoading(true);
    try {
      const response = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setPasswordMessage(payload.message || "Unable to change password.");
        return;
      }

      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setPasswordMessage("Password updated.");
    } catch {
      setPasswordMessage("Unable to change password.");
    } finally {
      setPasswordLoading(false);
    }
  }, [currentPasswordInput, newPasswordInput]);

  const exportAccountData = useCallback(async (today: string) => {
    try {
      const response = await fetch("/api/user/export", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `taskflow-export-${today}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      return; // Silently fail - not critical
    }
  }, []);

  const deleteAccount = useCallback(async (
    clearCachedAccountSession: () => void,
    callbackUrl: string
  ) => {
    if (!deletePasswordInput) {
      setDeleteMessage("Current password is required.");
      return;
    }

    const confirmed = window.confirm("Delete your account permanently? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: deletePasswordInput }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setDeleteMessage(payload.message || "Unable to delete account.");
        return;
      }

      setDeletePasswordInput("");
      setDeleteMessage("Account deleted.");
      clearCachedAccountSession();
      await signOut({ callbackUrl });
    } catch {
      setDeleteMessage("Unable to delete account.");
    } finally {
      setDeleteLoading(false);
    }
  }, [deletePasswordInput]);

  return {
    profileName,
    setProfileName,
    profileDateOfBirth,
    setProfileDateOfBirth,
    profileMessage,
    profileLoading,
    newEmailInput,
    setNewEmailInput,
    emailPassword,
    setEmailPassword,
    emailMessage,
    emailLoading,
    currentPasswordInput,
    setCurrentPasswordInput,
    newPasswordInput,
    setNewPasswordInput,
    passwordMessage,
    passwordLoading,
    deletePasswordInput,
    setDeletePasswordInput,
    deleteMessage,
    deleteLoading,
    saveProfile,
    changeEmail,
    changePassword,
    exportAccountData,
    deleteAccount,
  };
}
