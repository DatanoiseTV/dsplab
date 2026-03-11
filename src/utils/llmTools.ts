export interface LLMFunctionDef {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const getToolsDef = (): LLMFunctionDef[] => {
  return [
    {
      name: "complete_task",
      description: "Signals that the requested engineering goal is finished and has been verified. You MUST call this to end your autonomous loop. Provide a concise summary of the verification results.",
      parameters: {
        type: "object",
        properties: {
          verification_summary: { type: "string", description: "Technical proof that the code works (e.g. 'SNR is 80dB, harmonic peaks verified')." }
        },
        required: ["verification_summary"]
      }
    },
    {
      name: "show_function",
      description: "Returns the complete source code of a specific function by its name. Use this to inspect implementation details without reading the entire file.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "The name of the function to show." }
        },
        required: ["function_name"]
      }
    },
    {
      name: "delete_function",
      description: "Removes an entire function definition from the source code by its name.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "The name of the function to delete." }
        },
        required: ["function_name"]
      }
    },
    {
      name: "replace_function",
      description: "Replaces the entire body of a specific function by its name. This is faster and safer than line-based editing for functional updates.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "The name of the function to replace." },
          new_code: { type: "string", description: "The COMPLETE new definition of the function (starting with fun or and)." }
        },
        required: ["function_name", "new_code"]
      }
    },
    {
      name: "fix_boilerplate",
      description: "Automatically injects missing mandatory handlers (noteOn, noteOff, controlChange, default) if they are absent from the code.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "update_code",
      description: "CRITICAL: Overwrites the ENTIRE source code. You MUST provide the complete program including process, noteOn, noteOff etc. NEVER use this for partial snippets; use apply_diff or edit_lines for those.",
      parameters: {
        type: "object",
        properties: { new_code: { type: "string", description: "The COMPLETE new source code for the project." } },
        required: ["new_code"]
      }
    },
    {
      name: "edit_lines",
      description: "Replaces a specific block of lines in the code with new code.",
      parameters: {
        type: "object",
        properties: {
          start_line: { type: "number", description: "The 1-based line number to start replacing from (inclusive)." },
          end_line: { type: "number", description: "The 1-based line number to end replacing at (inclusive)." },
          new_code: { type: "string", description: "The new code to insert in place of those lines." }
        },
        required: ["start_line", "end_line", "new_code"]
      }
    },
    {
      name: "apply_diff",
      description: "Applies a surgical replacement in the code. Replaces 'old_string' with 'new_string'. Use significant context to avoid ambiguity.",
      parameters: {
        type: "object",
        properties: {
          old_string: { type: "string", description: "The exact literal text to find." },
          new_string: { type: "string", description: "The text to replace it with." }
        },
        required: ["old_string", "new_string"]
      }
    },
    {
      name: "grep_search",
      description: "Searches for a regex pattern in the current code and returns matching lines with numbers.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string", description: "The regex pattern to search for." } },
        required: ["pattern"]
      }
    },
    {
      name: "get_current_code",
      description: "Retrieves the current Vult code from the editor.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "set_knob",
      description: "Sets a virtual CC knob value (30-41). Values range from 0 to 127.",
      parameters: {
        type: "object",
        properties: {
          cc: { type: "number", description: "The CC number (30-41)." },
          value: { type: "number", description: "The value (0-127)." }
        },
        required: ["cc", "value"]
      }
    },
    {
      name: "send_midi_cc",
      description: "Sends a general MIDI CC message (0-127). Values range from 0 to 127.",
      parameters: {
        type: "object",
        properties: {
          cc: { type: "number", description: "The CC number (0-127)." },
          value: { type: "number", description: "The value (0-127)." }
        },
        required: ["cc", "value"]
      }
    },
    {
      name: "trigger_generator",
      description: "Triggers a laboratory generator (Impulse, Step, Sweep) on a specific input strip.",
      parameters: {
        type: "object",
        properties: { index: { type: "number", description: "The input strip index (0-based)." } },
        required: ["index"]
      }
    },
    {
      name: "configure_lab_input",
      description: "Configures a DSP Lab input strip type and parameters.",
      parameters: {
        type: "object",
        properties: {
          index: { type: "number", description: "The input strip index." },
          type: { type: "string", enum: ["oscillator", "cv", "impulse", "step", "sweep", "test_noise", "silence"], description: "The source type." },
          freq: { type: "number", description: "Frequency if oscillator." },
          oscType: { type: "string", enum: ["sine", "sawtooth", "square", "triangle"], description: "Oscillator shape." }
        },
        required: ["index", "type"]
      }
    },
    {
      name: "load_preset",
      description: "Loads one of the built-in Vult presets.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "The preset name." } },
        required: ["name"]
      }
    },
    {
      name: "configure_sequencer",
      description: "Configures the note roll sequencer. Use this to test patches with melodies.",
      parameters: {
        type: "object",
        properties: {
          bpm: { type: "number", description: "Tempo in BPM." },
          playing: { type: "boolean", description: "Whether the sequencer should be running." },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                active: { type: "boolean" },
                note: { type: "number", description: "MIDI note number." }
              }
            },
            description: "Full array of 16 steps."
          }
        }
      }
    },
    {
      name: "get_sequencer_state",
      description: "Returns the current state of the sequencer (BPM, steps, playing status).",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "list_presets",
      description: "Returns a list of available preset names.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_live_telemetry",
      description: "Retrieves current values of internal Vult variables. If the state is large, use the 'filter' parameter to find specific modules or variables. Results are capped at 100 by default to ensure performance.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Optional regex pattern to filter keys (e.g. 'osc1' or 'filter')." },
          limit: { type: "number", description: "Max number of variables to return (default 100)." }
        }
      }
    },
    {
      name: "get_state",
      description: "Retrieves the value of a specific internal variable by its key path (e.g. 'voice1.env'). Use this for precise verification.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "The full path of the variable." }
        },
        required: ["key"]
      }
    },
    {
      name: "get_state_history",
      description: "Retrieves a list of recent values for a specific variable (max 10). Use this to track changes over time, like envelope sweeps or state transitions.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "The full path of the variable." },
          count: { type: "number", description: "Number of historical snapshots to return (default 5, max 10)." }
        },
        required: ["key"]
      }
    },
    {
      name: "get_spectrum_data",
      description: "Retrieves a snapshot of the current 1024-band frequency spectrum of the output signal. Use this to verify audio activity or filter performance.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_peak_frequencies",
      description: "Analyzes the current spectrum and returns the frequencies (in Hz) with the most energy. Useful for verifying oscillator pitch or resonant peaks.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Number of peak frequencies to return (default 3)." }
        }
      }
    },
    {
      name: "get_harmonics",
      description: "Analyzes the harmonic content of the output signal. Identifies the fundamental frequency and the relative strength of the first 8 harmonics. Use this to verify waveform shapes (e.g. square vs sawtooth) or filter saturation.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_signal_quality",
      description: "Calculates advanced signal quality metrics including THD+N (Total Harmonic Distortion + Noise), SNR (Signal-to-Noise Ratio), and Peak Level in dBFS. Use this for high-precision technical audio analysis.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_audio_metrics",
      description: "Retrieves real-time audio metrics: Peak Level, RMS, Clipping Count, and Headroom (dB). It will wait the specified duration (in milliseconds) before taking the measurement, allowing audio to process.",
      parameters: { 
        type: "object", 
        properties: {
          wait_ms: { type: "number", description: "Time to wait in milliseconds before measuring (e.g., 500 or 1000). Default is 500." }
        } 
      }
    },
    {
      name: "ask_user",
      description: "Asks the user a question. Can include multiple choice options for quick responses.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user." },
          options: { 
            type: "array", 
            items: { 
              type: "object",
              properties: {
                label: { type: "string", description: "Display text for the button." },
                value: { type: "string", description: "Technical value returned to the agent when selected." }
              }
            },
            description: "Optional list of predefined choices for the user."
          }
        },
        required: ["question"]
      }
    },
    {
      name: "user_message",
      description: "Displays a status message or update to the user.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to display." }
        },
        required: ["message"]
      }
    },
    {
      name: "store_memory",
      description: "Stores a persistent technical fact, engineering preference, or project-specific detail in your long-term Prompt Memory. This memory persists across sessions and models. Use this to remember user stylistic choices, complex algorithm details, or verified DSP findings.",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "The specific fact or preference to remember (e.g. 'User prefers 0-1 range for all internal variables')." }
        },
        required: ["fact"]
      }
    },
    {
      name: "get_memory",
      description: "Retrieves all currently stored persistent memories from your long-term Prompt Memory. Use this at the start of a session or when uncertain about user preferences.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "multi_edit",
      description: "Applies multiple line-block edits in a single turn. Automatically handles line shifts. Provide edits in any order.",
      parameters: {
        type: "object",
        properties: {
          edits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                start_line: { type: "number", description: "1-based start line." },
                end_line: { type: "number", description: "1-based end line." },
                new_code: { type: "string", description: "New code for this range." }
              },
              required: ["start_line", "end_line", "new_code"]
            }
          },
          required: ["edits"]
        }
      }
    },
    {
      name: "set_probes",
      description: "Configures which internal 'mem' variables should be active in the multi-trace scope (max 6).",
      parameters: {
        type: "object",
        properties: {
          probes: { type: "array", items: { type: "string" }, description: "List of variable paths (e.g. ['voice1.env', 'lfo_val'])." }
        },
        required: ["probes"]
      }
    },
    {
      name: "list_functions",
      description: "Parses the current code and returns a list of all defined function signatures (name, parameters, return type).",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_vult_reference",
      description: "Returns a concise technical reference guide for the Vult language (types, syntax, operators, and built-in functions).",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "get_development_plan",
      description: "Retrieves the currently documented internal development plan. Use this to ensure you are following the agreed-upon strategy.",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "set_multiple_knobs",
      description: "Adjusts multiple laboratory knobs (MIDI CCs) in a single action. Use this for complex parameter setups.",
      parameters: {
        type: "object",
        properties: {
          knobs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cc: { type: "number", description: "The MIDI CC number (30-41)." },
                value: { type: "number", description: "The value (0.0 to 1.0)." }
              },
              required: ["cc", "value"]
            }
          },
          required: ["knobs"]
        }
      }
    },
    {
      name: "write_plan",
      description: "Documents your multi-step plan internally before execution. Use this to break down complex DSP tasks.",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "string", description: "The detailed step-by-step development plan." }
        },
        required: ["plan"]
      }
    },
    {
      name: "store_snapshot",
      description: "Saves a named version of the current code to the history. Use this to create restore points before making risky changes.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "A descriptive name or comment for this snapshot (like a commit message)." }
        },
        required: ["message"]
      }
    },
    {
      name: "tell",
      description: "Sends a status update, progress report, or informative message to the user while performing complex tasks.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to display to the user." }
        },
        required: ["message"]
      }
    }
  ];
};
