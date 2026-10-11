package com.im.shopfloor

import android.app.Application
import com.im.shopfloor.data.api.SupabaseClient
import com.im.shopfloor.data.local.SessionManager

class ShopFloorApp : Application() {

    lateinit var sessionManager: SessionManager
        private set

    lateinit var supabaseClient: SupabaseClient
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        sessionManager = SessionManager(this)
        supabaseClient = SupabaseClient(sessionManager)
    }

    companion object {
        lateinit var instance: ShopFloorApp
            private set
    }
}
