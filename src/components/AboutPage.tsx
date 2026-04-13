import React from 'react';
import { ShieldCheck, Info, Globe, Cpu, Heart } from 'lucide-react';

const AboutPage: React.FC = () => {
  return (
    <div className="ap animate-fade-in">
      <div className="aph">
        <div style={{ padding: '20px', background: 'var(--blue-bg)', borderRadius: '24px', color: 'var(--blue)', marginBottom: '24px' }}>
          <Info size={48} />
        </div>
        <h1>About IM-MES Production Tracker</h1>
        <p className="sub">Digital Intelligence for Precision Manufacturing</p>
      </div>

      <div className="ag">
        {/* Core Identity */}
        <div className="card about-main">
          <div className="ch">
            <span className="ct2"><Cpu size={14} /> System Core</span>
          </div>
          <div className="cb">
            <div className="v-row">
              <span className="v-label">Version</span>
              <span className="v-val">v2.4.0-stablediff</span>
            </div>
            <div className="v-row">
              <span className="v-label">Environment</span>
              <span className="v-val pg">Production</span>
            </div>
            <div className="v-row">
              <span className="v-label">Framework</span>
              <span className="v-val">React 19 + Vite</span>
            </div>
            <p style={{ marginTop: '20px', fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6' }}>
              IM-MES is a specialized Manufacturing Execution System designed for precision plastic injection moulding. 
              Built on a serverless real-time architecture, it provides sub-second visibility into shop floor operations.
            </p>
          </div>
        </div>

        {/* Compliance & Security */}
        <div className="card about-status">
          <div className="ch">
            <span className="ct2"><ShieldCheck size={14} /> Compliance & Standards</span>
          </div>
          <div className="cb">
             <div className="c-item">
                <div className="c-head">ISO 13485:2016</div>
                <div className="c-body">Full batch traceability and operator certification compliance enabled.</div>
             </div>
             <div className="c-item">
                <div className="c-head">Medical Device Protocol</div>
                <div className="c-body">Digital hygiene checklists and First Article Inspection (FAI) enforcement.</div>
             </div>
             <div className="c-item">
                <div className="c-head">Sub-Second Sync</div>
                <div className="c-body" style={{ color: 'var(--green)', fontWeight: 600 }}>Connected to Supabase Realtime</div>
             </div>
          </div>
        </div>
      </div>

      <div className="footer-credits">
         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text3)', fontSize: '12px' }}>
            Built with love <Heart size={12} fill="var(--red)" color="var(--red)" /> by 
            <a href="https://github.com/sreeharimp" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
              @sreeharimp
            </a>
         </div>
      </div>

      <style>{`
        .ap {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .aph {
          text-align: center;
          margin-bottom: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .aph h1 {
          font-size: 32px;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 8px;
        }
        .aph .sub {
          color: var(--text3);
          font-size: 16px;
        }
        .ag {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 24px;
        }
        .v-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
        }
        .v-label {
          color: var(--text3);
          font-size: 13px;
        }
        .v-val {
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
        }
        .c-item {
          margin-bottom: 16px;
        }
        .c-head {
          font-weight: 700;
          font-size: 12px;
          color: var(--text);
          margin-bottom: 4px;
        }
        .c-body {
          font-size: 11px;
          color: var(--text3);
          line-height: 1.4;
        }
        .footer-credits {
          margin-top: 80px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }
        .socials {
          display: flex;
          gap: 16px;
          color: var(--text3);
        }
        @media (max-width: 768px) {
          .ag {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default AboutPage;
