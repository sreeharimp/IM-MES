package com.im.shopfloor.data.local

import android.content.Context
import android.content.SharedPreferences
import com.im.shopfloor.data.model.Profile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("shopfloor_session", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private val _currentProfile = MutableStateFlow<Profile?>(loadSavedProfile())
    val currentProfile: StateFlow<Profile?> = _currentProfile

    var accessToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    fun saveProfile(profile: Profile) {
        val jsonStr = json.encodeToString(Profile.serializer(), profile)
        prefs.edit().putString(KEY_PROFILE, jsonStr).apply()
        _currentProfile.value = profile
    }

    private fun loadSavedProfile(): Profile? {
        val jsonStr = prefs.getString(KEY_PROFILE, null) ?: return null
        return try {
            json.decodeFromString(Profile.serializer(), jsonStr)
        } catch (_: Exception) {
            null
        }
    }

    fun clearSession() {
        prefs.edit().clear().apply()
        _currentProfile.value = null
    }

    val isLoggedIn: Boolean
        get() = !accessToken.isNullOrEmpty() && _currentProfile.value != null

    companion object {
        private const val KEY_TOKEN = "access_token"
        private const val KEY_PROFILE = "user_profile"
    }
}
